const { app, start } = require('../server');

let ready;

module.exports = async (request, response) => {
  ready ||= start();
  await ready;
  return app(request, response);
};
