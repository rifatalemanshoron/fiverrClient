const path = require("path");
const express = require("express");
const WebSocket = require("ws");
const app = express();
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

const inputFile = "beat it.mp3"; // MP3 file to stream
const sampleRate = 16000; // ESP32-Speaker Sample Rate
const chunkSize = 1024; // 1024 bytes per chunk

//const WS_PORT = process.env.WS_PORT || 8888;
const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, () =>
  console.log(`HTTP server listening at http://localhost:${PORT}`)
);
const wsServer = new WebSocket.Server({ server }, () =>
  console.log(`WS server is listening at ws://localhost:${PORT}`)
);

// array of connected websocket clients
let connectedClients = [];

wsServer.on("connection", (ws) => {
  connectedClients.push(ws); // add new connected client
  console.log("Total Connected: ", connectedClients.length);

  ws.on("message", (data) => {
//==========Below measure is taken to differntiate msg between browser Client and ESP client===//

    let message = data.toString(); // Convert received data to string
    if (message.startsWith("BROWSER|")) {
      console.log("Received msg from Browser!");
      let browserMsg = message.slice(8); // Remove "BROWSER|" header

      switch (browserMsg) {
        case "play":
          const fullStreamBuffer = convertToPCM(inputFile, sampleRate);
          connectedClients.forEach((client, i) => {
            if (client !== ws && client.readyState === client.OPEN) {//First part of this condition is important because the data is sent to all the clients except itself
              streamInChunks(client, fullStreamBuffer, chunkSize);
            } else if (!(client.readyState === client.OPEN)) {
              connectedClients.splice(i, 1); //Removes the inactive Client
            }
          });
          break;
          default:
            console.log(`Sorry, we are out of ${browserMsg}.`);
      }
    } 
//================ If the msg is not from browser then incoming data is sent to browser ==============//
    else {
      connectedClients.forEach((client, i) => {
        console.log("data incoming")
        if (client !== ws && client.readyState === client.OPEN) {//First part of this condition is important because the data is sent to all the clients except itself
          client.send(data);
        } else if (!(client.readyState === client.OPEN)) {

          connectedClients.splice(i, 1); //Removes the inactive Client
        }
      });
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    connectedClients.forEach((client, i) => {
      if (!(client.readyState === client.OPEN)) {
        connectedClients.splice(i, 1); //Removes the inactive Client
      }
    });
    console.log("Remaining Client: ", connectedClients.length);
  });
});

// HTTP stuff
app.use("/js", express.static("js"));
app.get("/", (req, res) =>
  res.sendFile(path.resolve(__dirname, "./audio_client.html"))
);


function convertToPCM(INPUT_FILE, SAMPLE_RATE) {
  const ffmpegProcess = ffmpeg()
    .setFfmpegPath(ffmpegPath)
    .input(INPUT_FILE)
    .audioCodec("pcm_s16le") // 16-bit PCM
    .audioFrequency(SAMPLE_RATE) // Match ESP32 sample rate
    .audioChannels(1) // Mono audio
    .format("s16le") // Raw PCM format
    .on("error", (err) => console.error("FFmpeg Error:", err))
    .on("end", () => {
      console.log("Streaming Done!");
    });

  return ffmpegProcess.pipe();
}

function streamInChunks(WEBSOCKET, FULL_STREAM_BUFFER, CHUNK_SIZE) {
  let audioBuffer = Buffer.alloc(0);
  FULL_STREAM_BUFFER.on("data", (chunk) => {
    // console.log("Main Chunk", chunk);    //For Debugging
    // console.log("Main Chunk Length", chunk.length); //For Debugging
    audioBuffer = Buffer.concat([audioBuffer, chunk]); // Append new data

    while (audioBuffer.length >= CHUNK_SIZE) {
      WEBSOCKET.send(audioBuffer.slice(0, CHUNK_SIZE)); // Send full chunk
      audioBuffer = audioBuffer.slice(CHUNK_SIZE); // Remove sent part
    }
  });
}
