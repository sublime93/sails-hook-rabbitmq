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

    npm install node-red-contrib-better-sftp
    
Configuration
-------------

Create a new config file **{sails root}/config/rabbitmq.js**
_connections_, _exchanges_, _queues_, and _bindings_ are native representations
of rabbot configuration.
 
_customModelGlobal_ does just as it state. It is the name of the global object to 
interface with rabbot

_routes_ is a list of routes and topics to watch. Action attribute is the path
to the action controller. 

_controllerDir_ attribute allows custom controller directory. Default is _app/controllers-mq_
 

``` JSON
module.exports.rabbitmq = {
  customModelGlobal: "MQ",
  routes: [
    { queue: 'topic.example.left.q', type: '#', action: '/example' }
  ]
  connection: {
    user: 'admin',
    pass: 'admin',
    server: [ 'localhost' ],
    port: 5672,
    vhost: '',
    timeout: 1000,
    failAfter: 30,
    retryLimit: 400
  },
  exchanges: [{
    name: 'topic-example-x',
    type: 'topic',
    autoDelete: true,
    persistent: true
  }],
  queues: [{
    name: 'topic.example.left.q',
    autoDelete: true,
    subscribe: true,
    noBatch: true,
    limit: 1
  }],
  bindings: [{
    exchange: 'topic-example-x',
    target: 'topic.example.left.q',
    keys: [ 'left' ]
  }]
};
 
```        
