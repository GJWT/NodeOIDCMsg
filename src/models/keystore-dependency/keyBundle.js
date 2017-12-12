
var async = require('asyncawait/async');
var await = require('asyncawait/await');
var forge = require('node-forge');
var fs = require('fs');
var jwkToPem = require('jwk-to-pem');
var path = require('path');
var XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;

var keyBundle = KeyBundle.prototype;

/**
   *  Contains a set of keys that have a common origin.
   * The sources can be serveral:
   * - A dictionary provided at the initialization, see keys below.
   * - A list of dictionaries provided at initialization
   * - A file containing one of: JWKS, DER encoded key
   * - A URL pointing to a webpages from which an JWKS can be downloaded
   * 
   * :param keys: A dictionary or a list of dictionaries with the keys ['kty', 'key', 'alg', 'use', 'kid']
   * :param source: Where the key set can be fetch from
   * :param verify_ssl: Verify the SSL cert used by the server
   * :param fileformat: For a local file either 'jwk' or 'der'
   * :param keytype: Iff local file and 'der' format what kind of key it is.
      presently only 'rsa' is supported.
   * :param keyusage: What the key loaded from file should be used for.
      Only applicable for DER files
   */
function KeyBundle(
    keys = [], source = '', fileformat = 'jwk', keyusage = 'None',
    cache_time = 300, verify_ssl = true, keyType = 'RSA',
    encEnc = 'A128CBC-HS256', keytype = 'RSA') {
  this.remote = false;
  this.verify_ssl = verify_ssl;
  this.cache_time = cache_time;
  this.time_out = 0;
  this.etag = '';
  this.source = null;
  this.fileformat = fileformat.toLowerCase();
  this.keytype = keytype;
  this.keyusage = keyusage;
  this.imp_jwks = null;
  this.last_updated = 0;
  this.formattedKeysList = [];

  if (keys) {
    if (typeof keys === 'object' && keys !== null && !(keys instanceof Array) &&
        !(keys instanceof Date)) {
      this.doKeys([keys]);
    } else {
      this.doKeys(keys);
    }
  } else {
    if (source.startsWith('file://')) {
      this.source = source.substring(7);
    } else if (source.startsWith('http://') || source.startsWith('https://')) {
      this.source = source;
      this.remote = true;
    } else if (source === '') {
      return
    } else {
      var formatArr = ['rsa', 'der', 'jwks'];
      if (formatArr.indexOf(fileformat.toLowerCase()) !== -1) {
        if (fs.lstatSync(source).isFile()) {
          this.source = source;
        } else {
          console.log('No such file');
        }
      } else {
        console.log('Unknown source');
      }
    }
    if (!this.remote) {
      var formatArr = ['jwks', 'jwk'];

      if (formatArr.indexOf(this.fileformat) !== -1) {
        keyBundle.doLocalJwk(this.source);
      } else if (this.fileformat === 'der') {
        keyBundle.doLocalDer(this.source, this.keytype, this.keyusage);
      }
    }
  };
}

keyBundle.keys = [];

var MAP = {'dec': 'enc', 'enc': 'enc', 'ver': 'sig', 'sig': 'sig'};


keyBundle.doKeys = function(keyData) {
  if ((typeof keyData) === 'string') {
    this.keys.push(keyData);
  } else {
    for (var i = 0; i < keyData.length; i++) {
      this.keys.push(keyData[i]);
    }
  }

};

keyBundle.getKty = function(typ = '') {
  this.upToDate();
  if (typ != '') {
    var keysList = [];
    for (var index = 0; index < this.keys.length; index++) {
      var key = this.keys[index];
      if (key.kty == typ)
      keysList.push(key);
    }
    return keysList;
  } else {
    return this.keys;
  }
};

keyBundle.getKeyList = function(keys) {
  var keysList = [];
  var impJwks = this.getJwks();
  if (keys.length === 0 && impJwks) {
    keys = impJwks.keys;
  }
  for (var index = 0; index < keys.length; index++) {
    var key = jwkToPem(keys[index]);
    if (
        keys[index].inactive_since &&
        keys[index].inactive_since <= new Date().getTime() / 1000) {
      console.log('Key not active :' + keys[index]);
    }
    else {
      keysList.push(key);
    }
  }
  this.formattedKeysList = keysList;
  return keysList;
};

keyBundle.getKeysOld = function() {
  if (this.formattedKeysList.length != 0) {
    return this.formattedKeysList;
  } else if (this.source !== '') {
    var HttpClient =
        function() {
      this.get = function(aUrl, aCallback) {
        var anHttpRequest = new XMLHttpRequest();
        anHttpRequest.onreadystatechange =
        function() {
          if (anHttpRequest.readyState === 4 && anHttpRequest.status === 200)
            aCallback(anHttpRequest.responseText);
        }

        anHttpRequest.open('GET', aUrl, true);
        anHttpRequest.send(null);
      }
    }

    var client = new HttpClient();
    client.get(this.source, function(response) {
      // do something with response
      var keys = JSON.parse(response).keys;
      return keyBundle.getKeyList(keys);
    });
  } else {
    return this.getKeyList(this.keys);
  }
};

keyBundle.getKeyWithKid = function(kid) {
  for (var index = 0; index < this.keys.length; index++) {
    var key = this.keys[index];
    if (key.kid == kid) {
      return key;
    }
  }

  this.update()

  for (var index = 0; index < this.keys.length; index++) {
    var key = this.keys[index];
    if (key.kid == kid) {
      return key;
    }
  }

  return null;
};

keyBundle.getJwks = function(private = false) {
  this.upToDate();
  var keys = [];
  var jwk = {'keys': keys};
  return JSON.stringify(jwk);
};

keyBundle.remove = function(key) {
  var i = this.keys.indexOf(key);
  if (i != -1) {
    this.keys.splice(i, 1);
  }
};

keyBundle.markAsInactive = function(kid) {
  var k = this.getKeyWithKid(kid);
  k.inactive_since = new Date().getTime() / 1000;
};

/**
   * Reload the keys if necessary.
   * This is a forced update, will happen even if cache time has not elapsed
   * Replaced keys will be marked as inactive and not removed.
   */
keyBundle.update = function() {
  res = true
  if (this.source) {
    var keys = this.keys;
    this.keys = []

    try {
      if (this.remote === false) {
        if (this.fileformat === 'jwks') {
          this.doLocalJwk(this.source)
        } else if (this.fileformat === 'der') {
          this.doLocalDer(this.source, this.keytype, this.keyusage)
        }
      } else {
        res = this.doRemote()
      }
    } catch (err) {
      console.log('Key bundle update failed: {}' + err);
      this.keys = keys;
      return false
    }

    now = new Date().getTime() / 1000;
    for (var index = 0; index < this.keys.length; index++) {
      var key = this.keys[index];
      if (this.keys.indexOf(key) === -1) {
        try {
          key.inactive_since;
        } catch (err) {
          key.inactive_since = now;
        }
        this.keys.push(key);
      }
    }
  }
  return res;
};

/**
  * Remove keys that should not be available any more.
  *  Outdated means that the key was marked as inactive at a time
  * that was longer ago then what is given in 'after'.
  * :param after: The length of time the key will remain in the KeyBundle before it should be removed.
  * :param when: To make it easier to test
  */
keyBundle.removeOutdated = function(after, when = 0) {
  if (when) {
    now = when
  } else {
    now = new Date().getTime() / 1000;
  }
  if (after instanceof float) {
    try {
      after = float(after)
    } catch (err) {
      console.log(err);
    }
  }
  kl = [];
  for (k in this.keys) {
    if (k.inactive_since && k.inactive_since + after < now) {
      continue
    } else {
      kl.append(k)
    }
  }
  this.keys = kl
};

keyBundle.doLocalJwk = function(filePath) {
  fs.readFile(filePath, {encoding: 'utf-8'}, function(err, data) {
    if (!err) {
      var keys = JSON.parse(data).keys;
      keyBundle.doKeys(keys);
    } else {
      console.log(err);
    }
    this.last_updated = new Date().getTime() / 1000;
  });
};

keyBundle.doLocalDer = function(filePath, keytype, keyUsage) {
  fs.readFile(filePath, {encoding: 'utf-8'}, function(err, data) {
    if (!err) {
      keyBundle.doKeys(data);
    } else {
      console.log(err);
    }
    this.last_updated = new Date().getTime() / 1000;
  });
};

keyBundle.doRemote = function() {
  var args = {'verify': this.verify_ssl};
  if (this.etag) {
    args['headers'] = {'If-None-Match': this.etag};
  }

  var HttpClient =
      function() {
    this.get = function(aUrl, aCallback) {
      var anHttpRequest = new XMLHttpRequest();
      anHttpRequest.onreadystatechange =
          function() {
        if (anHttpRequest.readyState === 4 && anHttpRequest.status === 200)
          aCallback(anHttpRequest.response);
      }

      anHttpRequest.open('GET', aUrl, true);
      anHttpRequest.setRequestHeader(
          'Content-type', 'application/json; charset=utf-8');
      anHttpRequest.setRequestHeader('Content-length', args.length);
      anHttpRequest.setRequestHeader('Connection', 'close');
      anHttpRequest.send(JSON.stringify(args));
    }
  }

  var client = new HttpClient();
  client.get(this.source, function(response) {
    if (response.status == 304) {
      this.time_out = new Date().getTime() / 1000 + this.cache_time;
      this.last_updated = new Date().getTime() / 1000
      try {
        this.doKeys(this.imp_jwks['keys']);
      } catch (err) {
        console.log('No \'keys\' keyword in JWKS');
      }
    } else if (response.status === 200) {
      this.time_out = new Date().getTime() / 1000 +
          this.cache_time

          this.imp_jwks = this.parseRemoteResponse(response);
      if (!(typeof this.imp_jwks === 'object' && this.imp_jwks !== null &&
            !(this.imp_jwks instanceof Array) &&
            !(this.imp_jwks instanceof Date)) &&
          !(JSON.parse(this.imp_jwks).keys)) {
        console.log('Malformed format for Imported JWK');
      }

      try {
        this.doKeys(JSON.parse(this.imp_jwks).keys)
      } catch (err) {
        console.log('No \'keys\' keyword in JWKS');
        console.log('MALFORMED FORMAT')
      }
      try {
        this.etag = response.headers['Etag']
      } catch (err) {
        console.log('Etag err')
      }
    } else {
      console.log('Update Failed');
    }
  });
  this.last_updated = new Date().getTime() / 1000
  return true

};

keyBundle.upToDate = function() {
  var res = false
  if (this.keys != []) {
    if (this.remote) {
      if (new Date().getTime() / 1000 > this.time_out) {
        if (this.update()) {
          res = true
        }
      }
    }
  }
  else if (this.remote) {
    if (this.update()) {
      res = true
    }
  }
  return res;
}
    
keyBundle.parseRemoteResponse = function(response) {
  try {
    if (response.headers['Content-Type'] != 'application/json') {
      console.log('Wrong Content Type' + response.headers['Content-Type']);
    }
  } catch (err) {
    pass;
  }

  try {
    return JSON.parse(response);
  } catch (err) {
    console.log('Value error');
  }
};

keyBundle.getKeys = function() {
  this.upToDate();
  var keyList = [];
  for (var index = 0; index < this.keys.length; index++) {
    if (this.keys[index].inactive_since &&
        this.keys[index].inactive_since < new Date().getTime() / 1000) {
      console.log('Don\'t include inactive keys')
    } else {
      keyList.push(this.keys[index]);
    }
  }
  return keyList;
}

keyBundle.activeKeys = function() {
  var res = [];
  for (var i = 0; i < this.keys.length; i++) {
    var key = this.keys[i];
    var ias = null;

    if (!key.inactive_since) {
      res.push(key);
    }
    else {
      ias = key.inactive_since;
      if (ias === 0) {
        res.append(key);
      }
    }
  }
  return res;
}
        
keyBundle.removeKeysByType = function(type) {
  var keys = this.getKty(type);
  for (var i = 0; i < keys.length; i++) {
    this.remove(keys[i]);
  }
};

keyBundle.kids = function() {
  this.upToDate();
  var kidsArr = [];
  for (var i = 0; i < this.keys.length; i++) {
    var key = this.keys[i];
    if (key.kid != '') {
      kidsArr.push(key.kid)
    }
  }
  return kidsArr;
};

/**
   * :param use:
   * :return: list of usage
   */
keyBundle.harmonizeUsage = function(fileName, typ, usage) {
  if (type(use) in six.string_types) {
    return [MAP[use]]
  } else if (use instanceof list) {
    ul = list(MAP.keys());
    var list = [];
    var set = new Set();
    for (var u = 0; u < use.length; u++) {
      if (ul.indexOf(u) != -1) {
        set.add(MAP[u])
      }
    }
    return Array.from(set)
  }
}

/**
   * Create a KeyBundle based on the content in a local file
   * :param filename: Name of the file
   * :param typ: Type of content
   * :param usage: What the key should be used for
   * :return: The created KeyBundle
   */
keyBundle.keybundleFromLocalFile = function(fileName, typ, usage) {
  if (typ.toLowerCase() === 'jwks') {
    kb = KeyBundle(null, filename, 'jwks', usage)
  } else if (typ.toLowerCase() === 'der') {
    kb = KeyBundle(null, filename, 'der', usage)
  } else {
    console.log('Unsupported key type')
  }
  return kb
};

keyBundle.dumpJwks = function(kbl, target, private = false) {
  throw new Error('Unsupported Operation Exception');
};

module.exports = KeyBundle;