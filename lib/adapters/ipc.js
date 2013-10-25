/**
 * @module ipc adapter
 */

var zmq = require("zmq");
var logger = require("../logger");

/**
 * @type {Socket}
 */
var socketIn = zmq.socket("pull");

/**
 * @type {Socket}
 */
var socketOut = zmq.socket("push");

/**
 * Starts ipc connection & binding
 * @param {string} addr
 */
exports.start = function (addr) {
  socketOut.bind(addr, function (err) {
    if (err) logger.makeLog("err", "hub-102", {msg: "failed to bind " + addr, err: err});
  });
  socketIn.connect(addr, function (err) {
    if (err) logger.makeLog("err", "hub-103", {msg: "failed to connect " + addr, err: err});
  });
  socketIn.on("message", function (buffer) {
    var message = JSON.parse(buffer.toString());
    exports.onMessage(message);
  });
};

/**
 * Sends an ipc message
 * @param message {object} message (hMessage)
 */
exports.send = function (container, message) {
};

/**
 * Ipc message handler has to be overridden (by the container)
 * @param message {object} message (hMessage)
 */
exports.onMessage = function (message) {
  logger.makeLog("warn", "hub-101", "ipc onMessage should be overridden");
};