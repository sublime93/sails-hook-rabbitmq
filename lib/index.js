/**
 * Module dependencies
 */

const rabbit = require('rabbot');
const fs = require('fs');
const path = require('path');

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
        connection: { },
        exchanges: [ ],
        queues: [ ],
        bindings: [ ],
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

      sails.log.info('Initializing `rabbitmq` hook...');

      sails.on('router:after', async function () {

        let rabbotConfig = {
          connection: sails.config.rabbitmq.connection,
          exchanges: sails.config.rabbitmq.exchanges,
          queues: sails.config.rabbitmq.queues,
          bindings: sails.config.rabbitmq.bindings,
        };

        try {
          await rabbit.configure(rabbotConfig);
          sails.log.info('Rabbit MQ - Connected `rabbitmq` to RabbitMQ Server(s)');
        } catch (err) {
          sails.log.error('Rabbit MQ - Unable to configure rabbot', err);
          return next('Unable to configure rabbot.');
        }

        rabbit.on('unreachable', function () {
          sails.log.error('Rabbit MQ - Unable to reach RabbitMQ server');
        });

        rabbit.on('connected ', function () {
          sails.log.error('Rabbit MQ - Connected to broker');
        });

        rabbit.on('closed  ', function () {
          sails.log.error('Rabbit MQ - Connection to broker has closed. This was intentionally called.');
        });

        rabbit.on('failed  ', function () {
          sails.log.error('Rabbit MQ - Connection to broker has faile. This was an untentional action.');
        });

        rabbit.on('unreachable   ', function () {
          sails.log.error('Rabbit MQ - Connection connection failure reached limit.');
          rabbit.retry();
        });

        global[sails.config.rabbitmq.customModelGlobal] = { };
        global[sails.config.rabbitmq.customModelGlobal].actions = [ ]

        global[sails.config.rabbitmq.customModelGlobal].publish = async function (exchangeName, type) {
          await rabbit.publish(exchangeName, type);
        }

        // Load actions into memory
        let controllerDirectory = path.join(that.getRootDir(), sails.config.rabbitmq.controllerDir);
        let files = that.walk(controllerDirectory);
        for (let route of sails.config.rabbitmq.routes) {
          let p = path.join(controllerDirectory, route.action + '.js');
          let actionPath = _.find(files, function (f) { return f === p});
          if (actionPath === undefined) return next('Controller/Action not found');
          let action = require(actionPath);
          global[sails.config.rabbitmq.customModelGlobal].actions.push(action);

          rabbit.handle({
            queue: route.queue,
            type: route.type
          }, async function (msg) {
            try {
              await action.default.fn(msg)
            } catch (err) {
              sails.log.error(`Rabbit MQ - Unable to process messag for action: ${route.action}`, err);
            }
            msg.ack();
          });

        }

      });

      next();
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
