const express = require("express");
const request = require("request-promise-native");
const crypto = require("crypto");
const uniq = require("lodash/uniq");

const PORT = process.env.GOOGLEDOCIMAGES_PORT || 8000;

const app = express();

let simpleCache = {};
const hash = crypto.createHash("sha256");

app.get("/", (res, req) => {
  const documentUrl = res.query.url;
  const urlHash = crypto
    .createHash("sha256")
    .update(documentUrl, "utf-8")
    .digest("hex");

  if (simpleCache[urlHash]) {
    req.send(simpleCache[urlHash]);
  } else {
    request(documentUrl)
      .then(res => {
        simpleCache[urlHash] = res;

        const processedDocument = processDocument(res);

        req.send(processedDocument);
      })
      .catch(reason => {
        req.status(reason.statusCode).send(reason.message);
      });
  }
});

function processDocument(body) {
  let imageMatches = uniq(
    body.match(
      /\(\/\/images-docs-opensocial\.googleusercontent\.com\/gadgets\/proxy\?url=(.*?)&(.*?)\)/g
    )
  );
  console.log(imageMatches);
  return body;
}

app.listen(PORT, () => console.log("Listening on port", PORT));
