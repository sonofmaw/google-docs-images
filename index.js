const express = require('express');
const request = require('request-promise-native');
const crypto = require('crypto');
const zlib = require('zlib');
const uniq = require('lodash/uniq');

require('log-timestamp');

const PORT = process.env.GOOGLEDOCIMAGES_PORT || 8000;

const app = express();

let simpleCache = {};
const hash = crypto.createHash('sha256');

const MINUTES = 60 * 1000;

function cleanCache() {
  Object.keys(simpleCache).forEach(key => {
    const entry = simpleCache[key];
    if (Date.now() - entry.timestamp > 5 * MINUTES) {
      delete simpleCache[key];
    }
  });
}

app.use(require('express-status-monitor')());

app.get('*', async (req, res) => {
  const documentUrl = req.originalUrl;

  try {
    const document = await request(`https://docs.google.com/${documentUrl}`);
    console.time('Processed document: ' + documentUrl);
    const processedDocument = processDocument(documentUrl, document);

    console.timeEnd('Processed document: ' + documentUrl);
    res.set('Cache-Control', 'max-age=300');
    res.send(processedDocument);
  } catch (reason) {
    res.status(reason.statusCode).send(reason.message);
  }
});

function processDocument(documentUrl, body) {
  // Process static relative links
  body = body.replace(/(href='|src=')(.*?)'/g, "$1https://docs.google.com$2'");

  // Process image links
  body = body.replace(
    /\(\/\/images-docs-opensocial\.googleusercontent\.com\/gadgets\/proxy\?url=(https?:\/\/.*?)&(.*?)\)/g,
    (source, imageUrl, parameters) =>
      convertImageLink(source, imageUrl, parameters)
  );

  // Process DSQ/DNS/DNF conditional formatting bugs
  body = body.replace(/color:#000000;">(DSQ|DNS|DNF)/g, 'color:#ffffff;">$1');

  // Add a signature
  body = body.replace(
    /(Published by (?:[\s\S]+?))<\/span>/,
    '$1 fixed by SonOfMaw </span>'
  );

  return body;
}

function convertImageLink(source, imageUrl, params) {
  let imageWidth = /resize_w=([0-9]+)/.exec(params);
  let imageHeight = /resize_h=([0-9]+)/.exec(params);
  let keepRatio = /no_expand=1/.test(params);

  let query = [];

  imageWidth && query.push('width=' + imageWidth[1]);
  imageHeight && query.push('height=' + imageHeight[1]);
  keepRatio && query.push('keepRatio=1');

  return `(//resize.sonofmaw.com/${Buffer.from(imageUrl).toString(
    'base64'
  )}?${query.join('&')})`;
}

app.listen(PORT, () => console.log('Listening on port', PORT));
