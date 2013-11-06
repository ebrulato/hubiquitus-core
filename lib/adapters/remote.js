/**
 * @module ZMQ
 */

var net = require("net");
var Socket = net.Socket;
var _ = require("lodash");
var EventEmitter = require("events").EventEmitter;
var h = require("../hubiquitus");
var logger = require("../logger");
var actors = require("../actors");

/**
 * @type {boolean}
 */
var locked = false;

/**
 * @type {number}
 */
exports.port = null;

/**
 * @type {Socket}
 */
var server = null;

/**
 * @type {object}
 */
var sockets = {};

/**
 * @type {EventEmitter}
 */
var events = new EventEmitter();
exports.on = events.on.bind(events);
exports.once = events.once.bind(events);
exports.emit = events.emit.bind(events);

/**
 * Starts connection & binding
 * @param {function} done
 */
exports.start = function (done) {
  if (!locked) {
    locked = true;
    events.once("server listenning", function () {
      logger.makeLog("trace", "hub-106", "tcp adapter started !");
      done();
    });
    listen();
  } else {
    logger.makeLog("warn", "hub-111", "try to start tcp adapter while already started/starting !");
  }
};

/**
 * Stops connection & binding
 * @param {function} done
 */
exports.stop = function (done) {
  if (locked) {
    locked = false;
    events.once("server closed", function () {
      logger.makeLog("trace", "hub-108", "tcp adapter stopped !");
      done();
    });
    server.close();
  } else {
    logger.makeLog("warn", "hub-114", "try to stop tcp adapter while already stopped/stopping !");
  }
};

/**
 * Starts server socket
 */
function listen() {
  server  = net.createServer();

  exports.port = _.random(3000, 30000);
  logger.makeLog("err", "hub-101", "tcp server socket tries to listen on port " + exports.port + "...");
  server.listen(exports.port);

  server.on("error", function (err) {
    logger.makeLog("trace", "hub-103", "tcp server socket failed to listen on port " + exports.port, err);
    server.close();
    startServer();
  });

  server.on("listening", function () {
    logger.makeLog("trace", "hub-105", "tcp server socket listenning on port " + exports.port + " !");
    events.emit("server listenning");
  });

  server.on("close", function () {
    logger.makeLog("trace", "hub-104", "tcp server socket closed !");
    events.emit("server stoped");
  });

  server.on("connection", function (socket) {
    socket.on("data", function (buffer) {
      onRequest(socket, buffer);
    });
  });
}

/**
 * Sends a message
 * @param container {object} target container
 * @param message {object} message (hMessage)
 * @param cb {function} callback
 */
exports.send = function (container, message, cb) {
  logger.makeLog("trace", "hub-109", "sending message " + message.id + " tcp...");
  findReqSocket(container, function (err, socket) {
    if (err) {
      logger.makeLog("trace", "hub-100", "socket search failed !", err);
      events.emit("droped", message);
    } else {
      logger.makeLog("trace", "hub-110", "socket found ! " + message.id + " sent tcp !");
      cb && events.once("response|" + message.id, cb);
      socket.write(new Buffer(JSON.stringify({message: message})));
    }
  });
};

/**
 * Message handler has to be overridden (by the container)
 * @param message {object} message (hMessage)
 * @param cb {function} reply callback
 */
exports.onMessage = function (message, cb) {
  events.emit("message", message, cb);
};

/**
 * Handles incomming request
 * @param socket {Socket} client socket
 * @param buffer {Buffer} incomming message
 */
function onRequest(socket, buffer) {
  var request;
  try {
    request = JSON.parse(buffer.toString("utf8"));
  } catch (err) {
    return logger.makeLog("warn", "hub-115", "error parsing incomming tcp message");
  }

  logger.makeLog("trace", "hub-110", "request received remotly", {request: request});
  var message = request.message;
  if (actors.exists(message.to, actors.scope.PROCESS)) {
    exports.onMessage(message, function (response) {
      socket.write(new Buffer(JSON.stringify({message: response})), "utf8");
    });
  } else {
    logger.makeLog("trace", "hub-119", "actor " + message.to + " not found !");
    socket.write(new Buffer(JSON.stringify({err: "actor not found !", message: message})), "utf8");
  }
}

/**
 * Handles incomming response
 * @param socket {Socket} client socket
 * @param buffer {Buffer} incomming message
 */
function onResponse(socket, buffer) {
  var response;
  try {
    response = JSON.parse(buffer.toString("utf8"));
  } catch (err) {
    return logger.makeLog("warn", "hub-115", "error parsing incomming tcp message");
  }

  logger.makeLog("trace", "hub-122", "response received remotly", {response: response});
  if (response.err) {
    events.emit("drop", response.message);
  } else {
    events.emit("response|" + response.message.id, null, response);
  }
}

/**
 * Finds a socket to reach a container
 * @param container {object} target container
 * @param {function} cb
 */
function findReqSocket(container, cb) {
  var socket;
  if (sockets[container.id]) {
    socket = sockets[container.id];
    if (socket.connected) {
      cb(null, socket);
    } else {
      cb("socket not available");
    }
  } else {
    socket = new Socket();
    socket.connected = false;
    sockets[container.id] = socket;

    socket.on("connect", function () {
      logger.makeLog("trace", "hub-116", "tcp socket to node " + container.id + " connected !");
      socket.connected = true;
      cb(null, socket);
    });

    socket.on("error", function (err) {
      logger.makeLog("trace", "hub-121", "tcp socket to node " + container.id + " in error", err);
      socket.connected = false;
    });

    socket.on("close", function () {
      logger.makeLog("trace", "hub-117", "tcp socket to node " + container.id + " closed");
      socket.connected = false;
      socket.destroy();
      if (_.has(sockets, container.id)) {
        actors.removeByContainer(container.id);
        delete sockets[container.id];
      }
    });

    socket.on("data", function (buffer) {
      onResponse(socket, buffer);
    });

    socket.connect(container.netInfo.port, container.netInfo.ip);
  }
  return socket;
}