const {
  default: sslify,
  xForwardedProtoResolver: resolver,
} = require("koa-sslify");

module.exports = (strapi) => {
  return {
    initialize() {
      strapi.app.use(sslify({ resolver }));
    },
  };
};
