# sails-hook-rabbitmq

sails-hook-rabbitmq is a hook for sails.js which enables communication to
a Rabbit MQ server. The package used the library **rabbot** to enable and
simplify the communication with Rabbit MQ.

The hook does not do anything all that special. The hook exposes a global(configurable)
to access the **publish** method of rabbot. It also looks at a controllers folder
which has actions that are called when watching a specific route(or queue). If the
action successfully ends ``` msg.ack(); ``` is called. 

Install
-------

    npm install git+http://BOESGIT01/n-tech/sails-hook-rabbitmq.git
    
Configuration
-------------

Create a new config file **{sails root}/config/rabbitmq.js**
_connections_, _exchanges_, _queues_, and _bindings_ are native representations
of rabbot configuration.

_routes_ is a list of routes and topics to watch. Action attribute is the path
to the action controller. 
 
_customModelGlobal_ (rabbitmq) does just as it state. It is the name of the global object to 
interface with RabbitMQ

_controllerDir_ (/api/controllers-mq) attribute allows custom controller directory. Default is _api/controllers-mq_

_publishOnDisconnect_ (true) if a server disconnect is detected should we still publish the message? If true the message
will be stored in memory. Once server is back online message will be sent. 

_queueOnDisconnect_ (true) if a server disconnect is detected should we still queue the message? If true the message
will be stored in memory. Once server is back online message will be sent. 

_saveFailedMessageOnClose_ (false) Not implemented yet

_waitForServerToAcceptMessages_ (true) Should we wait for the sever to accept a message before responding publish/queue 
function call. If true and the server is offline we the function will not return until the server is back online. 
 

``` javascript
module.exports.rabbitmq = {
  customModelGlobal: "MQ",
  controllerDir: '/api/controllers-mq',
  connections: [{
    username: 'admin',
    password: 'admin',
    host: 'localhost',
  }],
  connectionConfig: {
    json: true,
    heartbeatIntervalInSeconds: 5,
    reconnectTimeInSeconds: 10,
    connectionOptions: {},
    timeout: 1000,
    failAfter: 30,
    retryLimit: 400
  },
  channels: [
    {
      name: 'channel_1',
      default: true,
      prefetch: 1,
      exchanges: [ {
        name: 'ss.worker',
        type: 'topic',
        config: {
          autoDelete: false,
          persistent: true
        }
      } ],
      queues: [{
        name: 'worker.packages',
        config: {
          durable: true,
          autoDelete: false,
          subscribe: true,
          noBatch: true
        }
      }, {
        name: 'worker.general',
        config: {
          durable: true,
          autoDelete: false,
          subscribe: true,
          noBatch: true
        }
      }],
      bindings: [{
        exchange: 'worker',
        target: 'worker.packages',
        key: 'packages'
      }]
    }
  ],
  routes: [
    { queue: 'ss.worker.general', action: '/general' },
    { queue: 'ss.worker.packages',  action: '/packages' }
  ]
};

 
```        

Publishing
---------

``` javascript

await MQ.publish({exchange}, {key}, { payload }); 

await MQ.publish('worker', 'packages', { test: 'test message' });
```

Publishing - Directly to Queue
---------

``` javascript

await MQ.sendToQueue({queue}, { payload });

await MQ.sendToQueue('worker.general', { test: 'test message' });
```

Controller Example
------------------

``` javascript
exports.default = {
  fn: async function (message) {
    console.log('test', message.body.message);
  }
};

```
