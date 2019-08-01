/**
 * Module dependencies
 */

const fs = require('fs');
const path = require('path');
const amqp = require('amqp-connection-manager');
/**
 * sails-hook-rabbitmq
 */
module.exports = function sailsHookRabbitMQ(sails) {
  return {
    /**
     * Default configuration for hook, you can override these on your own config file if needed.
     */
    defaults: {
      rabbitmq: {
        customModelGlobal: 'rabbitmq',
        controllerDir: '/api/controllers-mq',
        publishOnDisconnect: true,
        queueOnDisconnect: true,
        saveFailedMessageOnClose: true,
        connections: [ ],
        connectionConfig: {
          json: true,
          heartbeatIntervalInSeconds: 5,
          reconnectTimeInSeconds: 10,
          connectionOptions: {}
        },
        channels: [
          {
            exchanges: [ ],
            queues: [ ],
            bindings: [ ],
          }
        ],
        routes: [ ]
      }
    },
    /**
     * Method that runs automatically when the hook initializes itself.
     *
     * @param   {Function}  next    Callback function to call after all is done
     */
    initialize: async function initialize(next) {
      let that = this;
      this.connection = {};
      this.connected = false;
      this.timesChecked = 0;
      this.channels = { };
      global[sails.config.rabbitmq.customModelGlobal] = { };
      global[sails.config.rabbitmq.customModelGlobal].actions = [ ];
      global[sails.config.rabbitmq.customModelGlobal].channels = this.channels;

      sails.log.info('Rabbit MQ - Initializing `rabbitmq` hook...');

      // Load actions into memory
      let controllerDirectory = path.join(that.getRootDir(), sails.config.rabbitmq.controllerDir);
      let files = that.walk(controllerDirectory);
      for (let route of sails.config.rabbitmq.routes) {
        let p = path.join(controllerDirectory, route.action + '.js');
        let actionPath = _.find(files, function (f) { return f === p});
        if (actionPath === undefined) return next('Controller/Action not found');
        let action = require(actionPath);
        action._route = route;
        global[sails.config.rabbitmq.customModelGlobal].actions.push(action);
      }

      sails.on('router:after', async function () {
        await that.initializeAmqp();
        await that.checkAndLoadFailedMessages();
        await that.configureAmqpConnection();
        // await that.subscribeToRoutes();

        that.validateConnection();
      });

      global[sails.config.rabbitmq.customModelGlobal].publish = async function(exchange, routingKey, content) {
        return that.channels.default.publish(exchange, routingKey, content);
      }

      global[sails.config.rabbitmq.customModelGlobal].sendToQueue = async function(queue, content) {
        return that.channels.default.sendToQueue(queue, content);
      }


      next();
    },
    initializeAmqp: async function () {
      let that = this;
      sails.log.debug('Rabbit MQ - Setting up AMQP connection');

      let urls = [];
      for (let con of sails.config.rabbitmq.connections) {
        let protocol = con.protocol || 'amqp';
        let port = con.port || '5672';
        let vhost = con.vhost || '';
        let connectionUrl = `${protocol}://${con.username}:${con.password}@${con.host}:${port}/${vhost}`;
        urls.push(connectionUrl);
      }

      this.connection = amqp.connect(urls, sails.config.rabbitmq.connectionConfig);

      // Monitor connection events
      this.connection.on('connect', function (t) {
        that.connected = true;
        sails.log.info('Rabbit MQ - Connected to AMQP server');
      });

      this.connection.on('disconnect', function (e) {
        that.connected = false;
        sails.log.error('Rabbit MQ - Disconnected from AMQP server', e);
      });

    },
    configureAmqpConnection: async function () {
      for (let channelConfig of sails.config.rabbitmq.channels) {
        let channelWrapper = this.connection.createChannel({ json: true, name: channelConfig.name });
        this.channels[channelConfig.name] = channelWrapper;
        if (channelConfig.default) this.channels.default = channelWrapper;

        this.subscribeToChannelEvents(channelWrapper, channelConfig.name);
        channelWrapper.addSetup(async function(channel) {
          channel.prefetch(channelConfig.prefetch || 1);

          let chanelSetups = []
          for (let exchange of channelConfig.exchanges) {
            chanelSetups.push(channel.assertExchange(exchange.name, exchange.type, exchange.config))
          }
          for (let queue of channelConfig.queues) {
            chanelSetups.push(channel.assertQueue(queue.name, queue.config))
          }
          for (let binding of channelConfig.bindings) {
            chanelSetups.push(channel.bindQueue(binding.target, binding.exchange, binding.key))
          }
          await Promise.all(chanelSetups);

          for (let action of global[sails.config.rabbitmq.customModelGlobal].actions) {
            channel.consume(action._route.queue, async function (msg) {
              try {
                msg.body = JSON.parse(msg.content);
                await action.default.fn(msg);
                channel.ack(msg);
              } catch (err) {
                sails.log.error(`Rabbit MQ - Unable to process messag for action: ${route.action}`, err);
              }
            });
          }
        })
      }
    },
    checkAndLoadFailedMessages: async function () {
      // monitor process and fire callback when process is ending
      if (sails.config.rabbitmq.saveFailedMessageOnClose) {
        sails.on('lower', function () {
          sails.log.warn('Rabbit MQ - Saving messages to file on lower');
          // must be synchronous to prevent app from closing

        });
      }
    },
    subscribeToRoutes: async function () {
      for (let action of global[sails.config.rabbitmq.customModelGlobal].actions) {
        let channel = action._route.channel || 'default';
        this.channels[channel].consume(action._route.queue, async function (msg) {
          try {
            await action.default.fn(msg);
            channel.ack(msg);
          } catch (err) {
            sails.log.error(`Rabbit MQ - Unable to process messag for action: ${route.action}`, err);
          }
        });
      }
    },
    validateConnection: function () {
      let that = this;
      setTimeout(function () {
        if (that.timesChecked < 6) {
          that.timesChecked += 1;
          if (that.connected === false) that.validateConnection();
        } else {
          throw new Error('failed connection test');
        }
      }, 1000)
    },
    subscribeToChannelEvents: function (channel, name) {
      channel.on('connect', function () {
        sails.log.info(`RabbitMQ - channel: ${name} connected`);
      });

      channel.on('close', function () {
        sails.log.warn(`RabbitMQ - channel: ${name} closed`);
      });

      channel.on('error', function (err) {
        sails.log.error(`RabbitMQ - channel: ${name} errored`, err);
      });
    },
    getRootDir: function () {
      var _rootDir;
      var NODE_MODULES = path.sep + 'node_modules' + path.sep;
      var cwd = process.cwd();
      var pos = cwd.indexOf(NODE_MODULES);
      if (pos !== -1) {
        return cwd.substring(0, pos);
      } else if (fs.existsSync(path.join(cwd, 'package.json'))) {
        return cwd;
      } else {
        pos = __dirname.indexOf(NODE_MODULES);
        if (pos === -1) {
          return path.normalize(path.join(__dirname, '..'));
        } else {
          return __dirname.substring(0, pos);
        }
      }
    },
    walk: function(dir) {
      let results = [];
      let list = fs.readdirSync(dir);
      list.forEach(function(file) {
        file = path.join(dir, file);
        let stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
          // Recurse into a subdirectory
          results = results.concat(walk(file));
        } else {
          // Is a file
          results.push(file);
        }
      });
      return results;
    }
  }
};
