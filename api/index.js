const { app, start } = require('../local-server');

let ready;

module.exports = async (request, response) => {
  ready ||= start();
  await ready;
  return app(request, response);
};
