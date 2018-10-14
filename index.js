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

app.get('*', (req, res) => {
  const documentUrl = req.originalUrl;
  /*const urlHash = crypto
    .createHash('sha256')
    .update(documentUrl)
    .digest('hex');

  if (simpleCache[urlHash]) {
    zlib.gunzip(simpleCache[urlHash].content, (err, document) => {
      res.set('Cache-Control', 'max-age=300');
      res.send(document.toString());
    });
    cleanCache();
  } else*/ {
    request(`https://docs.google.com/${documentUrl}`)
      .then(document => {
        const processedDocument = processDocument(documentUrl, document);

        /*zlib.gzip(processedDocument, (err, compressedDocument) => {
          simpleCache[urlHash] = {
            timestamp: Date.now(),
            content: compressedDocument
          };
*/
        console.log('Processed document:', documentUrl);
        res.set('Cache-Control', 'max-age=300');
        res.send(processedDocument);
        //      });
      })
      .catch(reason => {
        res.status(reason.statusCode).send(reason.message);
      });
  }
});

function processDocument(documentUrl, body) {
  // Process static relative links
  const staticLinkRe = /(?:href|src)='(.*?)'/g;
  let staticLinkMatch;
  while ((staticLinkMatch = staticLinkRe.exec(body)) !== null) {
    body = body.replace(
      staticLinkMatch[1],
      'https://docs.google.com' + staticLinkMatch[1]
    );
  }

  // Process image links
  const imageLinkRe = /\(\/\/images-docs-opensocial\.googleusercontent\.com\/gadgets\/proxy\?url=(https?:\/\/.*?)&(.*?)\)/;
  let imageLinkMatch;
  while ((imageLinkMatch = imageLinkRe.exec(body)) !== null) {
    const source = imageLinkMatch[0];
    const conversionResult = convertImageLink(
      source,
      imageLinkMatch[1],
      imageLinkMatch[2]
    );
    body = body.replace(source, conversionResult);
  }

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
