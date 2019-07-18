/**
 * Module dependencies
 */

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
        connection: { },
        exchanges: [ ],
        queues: [ ],
        bindings: [ ]
      }
    },
    /**
     * Method that runs automatically when the hook initializes itself.
     *
     * @param   {Function}  next    Callback function to call after all is done
     */
    initialize: function initialize(next) {
      sails.log.info('Initializing `rabbitmq` hook...');
      next();
    }
  }
};
