const mongoose = require("mongoose");

let connected = false;

async function connect(uri) {
  if (connected) return mongoose;
  if (!uri) {
    console.warn("MONGO_URI not provided — skipping DB connection");
    return null;
  }
  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    connected = true;
    console.log("MongoDB connected");
    return mongoose;
  } catch (e) {
    console.error("MongoDB connection error:", e.message || e);
    throw e;
  }
}

module.exports = { connect, mongoose };
