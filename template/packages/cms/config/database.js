module.exports = ({ env }) => ({
  defaultConnection: "default",
  connections: {
    default: {
      connector: "mongoose",
      settings: {
        client: "mongo",
        uri: env("DATABASE_URI"),
      },
      options: {
        authenticationDatabase: "admin",
        ssl: ["stage", "production"].includes(process.env.NODE_ENV),
      },
    },
  },
});
