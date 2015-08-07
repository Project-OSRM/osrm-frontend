(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.osrm = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
/*! https://mths.be/punycode v1.3.2 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports &&
		!exports.nodeType && exports;
	var freeModule = typeof module == 'object' && module &&
		!module.nodeType && module;
	var freeGlobal = typeof global == 'object' && global;
	if (
		freeGlobal.global === freeGlobal ||
		freeGlobal.window === freeGlobal ||
		freeGlobal.self === freeGlobal
	) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		var result = [];
		while (length--) {
			result[length] = fn(array[length]);
		}
		return result;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings or email
	 * addresses.
	 * @private
	 * @param {String} domain The domain name or email address.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		var parts = string.split('@');
		var result = '';
		if (parts.length > 1) {
			// In email addresses, only the domain name should be punycoded. Leave
			// the local part (i.e. everything up to `@`) intact.
			result = parts[0] + '@';
			string = parts[1];
		}
		// Avoid `split(regex)` for IE8 compatibility. See #17.
		string = string.replace(regexSeparators, '\x2E');
		var labels = string.split('.');
		var encoded = map(labels, fn).join('.');
		return result + encoded;
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
	 * Punycode string of ASCII-only symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name or an email address
	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
	 * it doesn't matter if you call it on a string that has already been
	 * converted to Unicode.
	 * @memberOf punycode
	 * @param {String} input The Punycoded domain name or email address to
	 * convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(input) {
		return mapDomain(input, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name or an email address to
	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
	 * i.e. it doesn't matter if you call it with a domain that's already in
	 * ASCII.
	 * @memberOf punycode
	 * @param {String} input The domain name or email address to convert, as a
	 * Unicode string.
	 * @returns {String} The Punycode representation of the given domain name or
	 * email address.
	 */
	function toASCII(input) {
		return mapDomain(input, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.3.2',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && freeModule) {
		if (module.exports == freeExports) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],2:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],3:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],4:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":2,"./encode":3}],5:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var punycode = require('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a puny coded representation of "domain".
      // It only converts the part of the domain name that
      // has non ASCII characters. I.e. it dosent matter if
      // you call it with a domain that already is in ASCII.
      var domainArray = this.hostname.split('.');
      var newOut = [];
      for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            'xn--' + punycode.encode(s) : s);
      }
      this.hostname = newOut.join('.');
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  Object.keys(this).forEach(function(k) {
    result[k] = this[k];
  }, this);

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    Object.keys(relative).forEach(function(k) {
      if (k !== 'protocol')
        result[k] = relative[k];
    });

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      Object.keys(relative).forEach(function(k) {
        result[k] = relative[k];
      });
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!isNull(result.pathname) || !isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!isNull(result.pathname) || !isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

function isString(arg) {
  return typeof arg === "string";
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isNull(arg) {
  return arg === null;
}
function isNullOrUndefined(arg) {
  return  arg == null;
}

},{"punycode":1,"querystring":4}],6:[function(require,module,exports){
/**
 * Module dependencies
 */

var debug = require('debug')('jsonp');

/**
 * Module exports.
 */

module.exports = jsonp;

/**
 * Callback index.
 */

var count = 0;

/**
 * Noop function.
 */

function noop(){}

/**
 * JSONP handler
 *
 * Options:
 *  - param {String} qs parameter (`callback`)
 *  - prefix {String} qs parameter (`__jp`)
 *  - name {String} qs parameter (`prefix` + incr)
 *  - timeout {Number} how long after a timeout error is emitted (`60000`)
 *
 * @param {String} url
 * @param {Object|Function} optional options / callback
 * @param {Function} optional callback
 */

function jsonp(url, opts, fn){
  if ('function' == typeof opts) {
    fn = opts;
    opts = {};
  }
  if (!opts) opts = {};

  var prefix = opts.prefix || '__jp';

  // use the callback name that was passed if one was provided.
  // otherwise generate a unique name by incrementing our counter.
  var id = opts.name || (prefix + (count++));

  var param = opts.param || 'callback';
  var timeout = null != opts.timeout ? opts.timeout : 60000;
  var enc = encodeURIComponent;
  var target = document.getElementsByTagName('script')[0] || document.head;
  var script;
  var timer;


  if (timeout) {
    timer = setTimeout(function(){
      cleanup();
      if (fn) fn(new Error('Timeout'));
    }, timeout);
  }

  function cleanup(){
    if (script.parentNode) script.parentNode.removeChild(script);
    window[id] = noop;
    if (timer) clearTimeout(timer);
  }

  function cancel(){
    if (window[id]) {
      cleanup();
    }
  }

  window[id] = function(data){
    debug('jsonp got', data);
    cleanup();
    if (fn) fn(null, data);
  };

  // add qs component
  url += (~url.indexOf('?') ? '&' : '?') + param + '=' + enc(id);
  url = url.replace('?&', '?');

  debug('jsonp req "%s"', url);

  // create script
  script = document.createElement('script');
  script.src = url;
  target.parentNode.insertBefore(script, target);

  return cancel;
}

},{"debug":7}],7:[function(require,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;

/**
 * Use chrome.storage.local if we are in an app
 */

var storage;

if (typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined')
  storage = chrome.storage.local;
else
  storage = localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  return ('WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      storage.removeItem('debug');
    } else {
      storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = storage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage(){
  try {
    return window.localStorage;
  } catch (e) {}
}

},{"./debug":8}],8:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = Array.prototype.slice.call(arguments);

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    if ('function' === typeof exports.formatArgs) {
      args = exports.formatArgs.apply(self, args);
    }
    var logFn = enabled.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":9}],9:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],10:[function(require,module,exports){
function corslite(url, callback, cors) {
    var sent = false;

    if (typeof window.XMLHttpRequest === 'undefined') {
        return callback(Error('Browser not supported'));
    }

    if (typeof cors === 'undefined') {
        var m = url.match(/^\s*https?:\/\/[^\/]*/);
        cors = m && (m[0] !== location.protocol + '//' + location.domain +
                (location.port ? ':' + location.port : ''));
    }

    var x = new window.XMLHttpRequest();

    function isSuccessful(status) {
        return status >= 200 && status < 300 || status === 304;
    }

    if (cors && !('withCredentials' in x)) {
        // IE8-9
        x = new window.XDomainRequest();

        // Ensure callback is never called synchronously, i.e., before
        // x.send() returns (this has been observed in the wild).
        // See https://github.com/mapbox/mapbox.js/issues/472
        var original = callback;
        callback = function() {
            if (sent) {
                original.apply(this, arguments);
            } else {
                var that = this, args = arguments;
                setTimeout(function() {
                    original.apply(that, args);
                }, 0);
            }
        }
    }

    function loaded() {
        if (
            // XDomainRequest
            x.status === undefined ||
            // modern browsers
            isSuccessful(x.status)) callback.call(x, null, x);
        else callback.call(x, x, null);
    }

    // Both `onreadystatechange` and `onload` can fire. `onreadystatechange`
    // has [been supported for longer](http://stackoverflow.com/a/9181508/229001).
    if ('onload' in x) {
        x.onload = loaded;
    } else {
        x.onreadystatechange = function readystate() {
            if (x.readyState === 4) {
                loaded();
            }
        };
    }

    // Call the callback with the XMLHttpRequest object as an error and prevent
    // it from ever being called again by reassigning it to `noop`
    x.onerror = function error(evt) {
        // XDomainRequest provides no evt parameter
        callback.call(this, evt || true, null);
        callback = function() { };
    };

    // IE9 must have onprogress be set to a unique function.
    x.onprogress = function() { };

    x.ontimeout = function(evt) {
        callback.call(this, evt, null);
        callback = function() { };
    };

    x.onabort = function(evt) {
        callback.call(this, evt, null);
        callback = function() { };
    };

    // GET is the only supported HTTP Verb by XDomainRequest and is the
    // only one supported here.
    x.open('GET', url, true);

    // Send the request. Sending data is not supported.
    x.send(null);
    sent = true;

    return x;
}

if (typeof module !== 'undefined') module.exports = corslite;

},{}],11:[function(require,module,exports){
/*
 Leaflet, a JavaScript library for mobile-friendly interactive maps. http://leafletjs.com
 (c) 2010-2013, Vladimir Agafonkin
 (c) 2010-2011, CloudMade
*/
(function (window, document, undefined) {
var oldL = window.L,
    L = {};

L.version = '0.7.2';

// define Leaflet for Node module pattern loaders, including Browserify
if (typeof module === 'object' && typeof module.exports === 'object') {
	module.exports = L;

// define Leaflet as an AMD module
} else if (typeof define === 'function' && define.amd) {
	define(L);
}

// define Leaflet as a global L variable, saving the original L to restore later if needed

L.noConflict = function () {
	window.L = oldL;
	return this;
};

window.L = L;


/*
 * L.Util contains various utility functions used throughout Leaflet code.
 */

L.Util = {
	extend: function (dest) { // (Object[, Object, ...]) ->
		var sources = Array.prototype.slice.call(arguments, 1),
		    i, j, len, src;

		for (j = 0, len = sources.length; j < len; j++) {
			src = sources[j] || {};
			for (i in src) {
				if (src.hasOwnProperty(i)) {
					dest[i] = src[i];
				}
			}
		}
		return dest;
	},

	bind: function (fn, obj) { // (Function, Object) -> Function
		var args = arguments.length > 2 ? Array.prototype.slice.call(arguments, 2) : null;
		return function () {
			return fn.apply(obj, args || arguments);
		};
	},

	stamp: (function () {
		var lastId = 0,
		    key = '_leaflet_id';
		return function (obj) {
			obj[key] = obj[key] || ++lastId;
			return obj[key];
		};
	}()),

	invokeEach: function (obj, method, context) {
		var i, args;

		if (typeof obj === 'object') {
			args = Array.prototype.slice.call(arguments, 3);

			for (i in obj) {
				method.apply(context, [i, obj[i]].concat(args));
			}
			return true;
		}

		return false;
	},

	limitExecByInterval: function (fn, time, context) {
		var lock, execOnUnlock;

		return function wrapperFn() {
			var args = arguments;

			if (lock) {
				execOnUnlock = true;
				return;
			}

			lock = true;

			setTimeout(function () {
				lock = false;

				if (execOnUnlock) {
					wrapperFn.apply(context, args);
					execOnUnlock = false;
				}
			}, time);

			fn.apply(context, args);
		};
	},

	falseFn: function () {
		return false;
	},

	formatNum: function (num, digits) {
		var pow = Math.pow(10, digits || 5);
		return Math.round(num * pow) / pow;
	},

	trim: function (str) {
		return str.trim ? str.trim() : str.replace(/^\s+|\s+$/g, '');
	},

	splitWords: function (str) {
		return L.Util.trim(str).split(/\s+/);
	},

	setOptions: function (obj, options) {
		obj.options = L.extend({}, obj.options, options);
		return obj.options;
	},

	getParamString: function (obj, existingUrl, uppercase) {
		var params = [];
		for (var i in obj) {
			params.push(encodeURIComponent(uppercase ? i.toUpperCase() : i) + '=' + encodeURIComponent(obj[i]));
		}
		return ((!existingUrl || existingUrl.indexOf('?') === -1) ? '?' : '&') + params.join('&');
	},
	template: function (str, data) {
		return str.replace(/\{ *([\w_]+) *\}/g, function (str, key) {
			var value = data[key];
			if (value === undefined) {
				throw new Error('No value provided for variable ' + str);
			} else if (typeof value === 'function') {
				value = value(data);
			}
			return value;
		});
	},

	isArray: Array.isArray || function (obj) {
		return (Object.prototype.toString.call(obj) === '[object Array]');
	},

	emptyImageUrl: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
};

(function () {

	// inspired by http://paulirish.com/2011/requestanimationframe-for-smart-animating/

	function getPrefixed(name) {
		var i, fn,
		    prefixes = ['webkit', 'moz', 'o', 'ms'];

		for (i = 0; i < prefixes.length && !fn; i++) {
			fn = window[prefixes[i] + name];
		}

		return fn;
	}

	var lastTime = 0;

	function timeoutDefer(fn) {
		var time = +new Date(),
		    timeToCall = Math.max(0, 16 - (time - lastTime));

		lastTime = time + timeToCall;
		return window.setTimeout(fn, timeToCall);
	}

	var requestFn = window.requestAnimationFrame ||
	        getPrefixed('RequestAnimationFrame') || timeoutDefer;

	var cancelFn = window.cancelAnimationFrame ||
	        getPrefixed('CancelAnimationFrame') ||
	        getPrefixed('CancelRequestAnimationFrame') ||
	        function (id) { window.clearTimeout(id); };


	L.Util.requestAnimFrame = function (fn, context, immediate, element) {
		fn = L.bind(fn, context);

		if (immediate && requestFn === timeoutDefer) {
			fn();
		} else {
			return requestFn.call(window, fn, element);
		}
	};

	L.Util.cancelAnimFrame = function (id) {
		if (id) {
			cancelFn.call(window, id);
		}
	};

}());

// shortcuts for most used utility functions
L.extend = L.Util.extend;
L.bind = L.Util.bind;
L.stamp = L.Util.stamp;
L.setOptions = L.Util.setOptions;


/*
 * L.Class powers the OOP facilities of the library.
 * Thanks to John Resig and Dean Edwards for inspiration!
 */

L.Class = function () {};

L.Class.extend = function (props) {

	// extended class with the new prototype
	var NewClass = function () {

		// call the constructor
		if (this.initialize) {
			this.initialize.apply(this, arguments);
		}

		// call all constructor hooks
		if (this._initHooks) {
			this.callInitHooks();
		}
	};

	// instantiate class without calling constructor
	var F = function () {};
	F.prototype = this.prototype;

	var proto = new F();
	proto.constructor = NewClass;

	NewClass.prototype = proto;

	//inherit parent's statics
	for (var i in this) {
		if (this.hasOwnProperty(i) && i !== 'prototype') {
			NewClass[i] = this[i];
		}
	}

	// mix static properties into the class
	if (props.statics) {
		L.extend(NewClass, props.statics);
		delete props.statics;
	}

	// mix includes into the prototype
	if (props.includes) {
		L.Util.extend.apply(null, [proto].concat(props.includes));
		delete props.includes;
	}

	// merge options
	if (props.options && proto.options) {
		props.options = L.extend({}, proto.options, props.options);
	}

	// mix given properties into the prototype
	L.extend(proto, props);

	proto._initHooks = [];

	var parent = this;
	// jshint camelcase: false
	NewClass.__super__ = parent.prototype;

	// add method for calling all hooks
	proto.callInitHooks = function () {

		if (this._initHooksCalled) { return; }

		if (parent.prototype.callInitHooks) {
			parent.prototype.callInitHooks.call(this);
		}

		this._initHooksCalled = true;

		for (var i = 0, len = proto._initHooks.length; i < len; i++) {
			proto._initHooks[i].call(this);
		}
	};

	return NewClass;
};


// method for adding properties to prototype
L.Class.include = function (props) {
	L.extend(this.prototype, props);
};

// merge new default options to the Class
L.Class.mergeOptions = function (options) {
	L.extend(this.prototype.options, options);
};

// add a constructor hook
L.Class.addInitHook = function (fn) { // (Function) || (String, args...)
	var args = Array.prototype.slice.call(arguments, 1);

	var init = typeof fn === 'function' ? fn : function () {
		this[fn].apply(this, args);
	};

	this.prototype._initHooks = this.prototype._initHooks || [];
	this.prototype._initHooks.push(init);
};


/*
 * L.Mixin.Events is used to add custom events functionality to Leaflet classes.
 */

var eventsKey = '_leaflet_events';

L.Mixin = {};

L.Mixin.Events = {

	addEventListener: function (types, fn, context) { // (String, Function[, Object]) or (Object[, Object])

		// types can be a map of types/handlers
		if (L.Util.invokeEach(types, this.addEventListener, this, fn, context)) { return this; }

		var events = this[eventsKey] = this[eventsKey] || {},
		    contextId = context && context !== this && L.stamp(context),
		    i, len, event, type, indexKey, indexLenKey, typeIndex;

		// types can be a string of space-separated words
		types = L.Util.splitWords(types);

		for (i = 0, len = types.length; i < len; i++) {
			event = {
				action: fn,
				context: context || this
			};
			type = types[i];

			if (contextId) {
				// store listeners of a particular context in a separate hash (if it has an id)
				// gives a major performance boost when removing thousands of map layers

				indexKey = type + '_idx';
				indexLenKey = indexKey + '_len';

				typeIndex = events[indexKey] = events[indexKey] || {};

				if (!typeIndex[contextId]) {
					typeIndex[contextId] = [];

					// keep track of the number of keys in the index to quickly check if it's empty
					events[indexLenKey] = (events[indexLenKey] || 0) + 1;
				}

				typeIndex[contextId].push(event);


			} else {
				events[type] = events[type] || [];
				events[type].push(event);
			}
		}

		return this;
	},

	hasEventListeners: function (type) { // (String) -> Boolean
		var events = this[eventsKey];
		return !!events && ((type in events && events[type].length > 0) ||
		                    (type + '_idx' in events && events[type + '_idx_len'] > 0));
	},

	removeEventListener: function (types, fn, context) { // ([String, Function, Object]) or (Object[, Object])

		if (!this[eventsKey]) {
			return this;
		}

		if (!types) {
			return this.clearAllEventListeners();
		}

		if (L.Util.invokeEach(types, this.removeEventListener, this, fn, context)) { return this; }

		var events = this[eventsKey],
		    contextId = context && context !== this && L.stamp(context),
		    i, len, type, listeners, j, indexKey, indexLenKey, typeIndex, removed;

		types = L.Util.splitWords(types);

		for (i = 0, len = types.length; i < len; i++) {
			type = types[i];
			indexKey = type + '_idx';
			indexLenKey = indexKey + '_len';

			typeIndex = events[indexKey];

			if (!fn) {
				// clear all listeners for a type if function isn't specified
				delete events[type];
				delete events[indexKey];
				delete events[indexLenKey];

			} else {
				listeners = contextId && typeIndex ? typeIndex[contextId] : events[type];

				if (listeners) {
					for (j = listeners.length - 1; j >= 0; j--) {
						if ((listeners[j].action === fn) && (!context || (listeners[j].context === context))) {
							removed = listeners.splice(j, 1);
							// set the old action to a no-op, because it is possible
							// that the listener is being iterated over as part of a dispatch
							removed[0].action = L.Util.falseFn;
						}
					}

					if (context && typeIndex && (listeners.length === 0)) {
						delete typeIndex[contextId];
						events[indexLenKey]--;
					}
				}
			}
		}

		return this;
	},

	clearAllEventListeners: function () {
		delete this[eventsKey];
		return this;
	},

	fireEvent: function (type, data) { // (String[, Object])
		if (!this.hasEventListeners(type)) {
			return this;
		}

		var event = L.Util.extend({}, data, { type: type, target: this });

		var events = this[eventsKey],
		    listeners, i, len, typeIndex, contextId;

		if (events[type]) {
			// make sure adding/removing listeners inside other listeners won't cause infinite loop
			listeners = events[type].slice();

			for (i = 0, len = listeners.length; i < len; i++) {
				listeners[i].action.call(listeners[i].context, event);
			}
		}

		// fire event for the context-indexed listeners as well
		typeIndex = events[type + '_idx'];

		for (contextId in typeIndex) {
			listeners = typeIndex[contextId].slice();

			if (listeners) {
				for (i = 0, len = listeners.length; i < len; i++) {
					listeners[i].action.call(listeners[i].context, event);
				}
			}
		}

		return this;
	},

	addOneTimeEventListener: function (types, fn, context) {

		if (L.Util.invokeEach(types, this.addOneTimeEventListener, this, fn, context)) { return this; }

		var handler = L.bind(function () {
			this
			    .removeEventListener(types, fn, context)
			    .removeEventListener(types, handler, context);
		}, this);

		return this
		    .addEventListener(types, fn, context)
		    .addEventListener(types, handler, context);
	}
};

L.Mixin.Events.on = L.Mixin.Events.addEventListener;
L.Mixin.Events.off = L.Mixin.Events.removeEventListener;
L.Mixin.Events.once = L.Mixin.Events.addOneTimeEventListener;
L.Mixin.Events.fire = L.Mixin.Events.fireEvent;


/*
 * L.Browser handles different browser and feature detections for internal Leaflet use.
 */

(function () {

	var ie = 'ActiveXObject' in window,
		ielt9 = ie && !document.addEventListener,

	    // terrible browser detection to work around Safari / iOS / Android browser bugs
	    ua = navigator.userAgent.toLowerCase(),
	    webkit = ua.indexOf('webkit') !== -1,
	    chrome = ua.indexOf('chrome') !== -1,
	    phantomjs = ua.indexOf('phantom') !== -1,
	    android = ua.indexOf('android') !== -1,
	    android23 = ua.search('android [23]') !== -1,
		gecko = ua.indexOf('gecko') !== -1,

	    mobile = typeof orientation !== undefined + '',
	    msPointer = window.navigator && window.navigator.msPointerEnabled &&
	              window.navigator.msMaxTouchPoints && !window.PointerEvent,
		pointer = (window.PointerEvent && window.navigator.pointerEnabled && window.navigator.maxTouchPoints) ||
				  msPointer,
	    retina = ('devicePixelRatio' in window && window.devicePixelRatio > 1) ||
	             ('matchMedia' in window && window.matchMedia('(min-resolution:144dpi)') &&
	              window.matchMedia('(min-resolution:144dpi)').matches),

	    doc = document.documentElement,
	    ie3d = ie && ('transition' in doc.style),
	    webkit3d = ('WebKitCSSMatrix' in window) && ('m11' in new window.WebKitCSSMatrix()) && !android23,
	    gecko3d = 'MozPerspective' in doc.style,
	    opera3d = 'OTransition' in doc.style,
	    any3d = !window.L_DISABLE_3D && (ie3d || webkit3d || gecko3d || opera3d) && !phantomjs;


	// PhantomJS has 'ontouchstart' in document.documentElement, but doesn't actually support touch.
	// https://github.com/Leaflet/Leaflet/pull/1434#issuecomment-13843151

	var touch = !window.L_NO_TOUCH && !phantomjs && (function () {

		var startName = 'ontouchstart';

		// IE10+ (We simulate these into touch* events in L.DomEvent and L.DomEvent.Pointer) or WebKit, etc.
		if (pointer || (startName in doc)) {
			return true;
		}

		// Firefox/Gecko
		var div = document.createElement('div'),
		    supported = false;

		if (!div.setAttribute) {
			return false;
		}
		div.setAttribute(startName, 'return;');

		if (typeof div[startName] === 'function') {
			supported = true;
		}

		div.removeAttribute(startName);
		div = null;

		return supported;
	}());


	L.Browser = {
		ie: ie,
		ielt9: ielt9,
		webkit: webkit,
		gecko: gecko && !webkit && !window.opera && !ie,

		android: android,
		android23: android23,

		chrome: chrome,

		ie3d: ie3d,
		webkit3d: webkit3d,
		gecko3d: gecko3d,
		opera3d: opera3d,
		any3d: any3d,

		mobile: mobile,
		mobileWebkit: mobile && webkit,
		mobileWebkit3d: mobile && webkit3d,
		mobileOpera: mobile && window.opera,

		touch: touch,
		msPointer: msPointer,
		pointer: pointer,

		retina: retina
	};

}());


/*
 * L.Point represents a point with x and y coordinates.
 */

L.Point = function (/*Number*/ x, /*Number*/ y, /*Boolean*/ round) {
	this.x = (round ? Math.round(x) : x);
	this.y = (round ? Math.round(y) : y);
};

L.Point.prototype = {

	clone: function () {
		return new L.Point(this.x, this.y);
	},

	// non-destructive, returns a new point
	add: function (point) {
		return this.clone()._add(L.point(point));
	},

	// destructive, used directly for performance in situations where it's safe to modify existing point
	_add: function (point) {
		this.x += point.x;
		this.y += point.y;
		return this;
	},

	subtract: function (point) {
		return this.clone()._subtract(L.point(point));
	},

	_subtract: function (point) {
		this.x -= point.x;
		this.y -= point.y;
		return this;
	},

	divideBy: function (num) {
		return this.clone()._divideBy(num);
	},

	_divideBy: function (num) {
		this.x /= num;
		this.y /= num;
		return this;
	},

	multiplyBy: function (num) {
		return this.clone()._multiplyBy(num);
	},

	_multiplyBy: function (num) {
		this.x *= num;
		this.y *= num;
		return this;
	},

	round: function () {
		return this.clone()._round();
	},

	_round: function () {
		this.x = Math.round(this.x);
		this.y = Math.round(this.y);
		return this;
	},

	floor: function () {
		return this.clone()._floor();
	},

	_floor: function () {
		this.x = Math.floor(this.x);
		this.y = Math.floor(this.y);
		return this;
	},

	distanceTo: function (point) {
		point = L.point(point);

		var x = point.x - this.x,
		    y = point.y - this.y;

		return Math.sqrt(x * x + y * y);
	},

	equals: function (point) {
		point = L.point(point);

		return point.x === this.x &&
		       point.y === this.y;
	},

	contains: function (point) {
		point = L.point(point);

		return Math.abs(point.x) <= Math.abs(this.x) &&
		       Math.abs(point.y) <= Math.abs(this.y);
	},

	toString: function () {
		return 'Point(' +
		        L.Util.formatNum(this.x) + ', ' +
		        L.Util.formatNum(this.y) + ')';
	}
};

L.point = function (x, y, round) {
	if (x instanceof L.Point) {
		return x;
	}
	if (L.Util.isArray(x)) {
		return new L.Point(x[0], x[1]);
	}
	if (x === undefined || x === null) {
		return x;
	}
	return new L.Point(x, y, round);
};


/*
 * L.Bounds represents a rectangular area on the screen in pixel coordinates.
 */

L.Bounds = function (a, b) { //(Point, Point) or Point[]
	if (!a) { return; }

	var points = b ? [a, b] : a;

	for (var i = 0, len = points.length; i < len; i++) {
		this.extend(points[i]);
	}
};

L.Bounds.prototype = {
	// extend the bounds to contain the given point
	extend: function (point) { // (Point)
		point = L.point(point);

		if (!this.min && !this.max) {
			this.min = point.clone();
			this.max = point.clone();
		} else {
			this.min.x = Math.min(point.x, this.min.x);
			this.max.x = Math.max(point.x, this.max.x);
			this.min.y = Math.min(point.y, this.min.y);
			this.max.y = Math.max(point.y, this.max.y);
		}
		return this;
	},

	getCenter: function (round) { // (Boolean) -> Point
		return new L.Point(
		        (this.min.x + this.max.x) / 2,
		        (this.min.y + this.max.y) / 2, round);
	},

	getBottomLeft: function () { // -> Point
		return new L.Point(this.min.x, this.max.y);
	},

	getTopRight: function () { // -> Point
		return new L.Point(this.max.x, this.min.y);
	},

	getSize: function () {
		return this.max.subtract(this.min);
	},

	contains: function (obj) { // (Bounds) or (Point) -> Boolean
		var min, max;

		if (typeof obj[0] === 'number' || obj instanceof L.Point) {
			obj = L.point(obj);
		} else {
			obj = L.bounds(obj);
		}

		if (obj instanceof L.Bounds) {
			min = obj.min;
			max = obj.max;
		} else {
			min = max = obj;
		}

		return (min.x >= this.min.x) &&
		       (max.x <= this.max.x) &&
		       (min.y >= this.min.y) &&
		       (max.y <= this.max.y);
	},

	intersects: function (bounds) { // (Bounds) -> Boolean
		bounds = L.bounds(bounds);

		var min = this.min,
		    max = this.max,
		    min2 = bounds.min,
		    max2 = bounds.max,
		    xIntersects = (max2.x >= min.x) && (min2.x <= max.x),
		    yIntersects = (max2.y >= min.y) && (min2.y <= max.y);

		return xIntersects && yIntersects;
	},

	isValid: function () {
		return !!(this.min && this.max);
	}
};

L.bounds = function (a, b) { // (Bounds) or (Point, Point) or (Point[])
	if (!a || a instanceof L.Bounds) {
		return a;
	}
	return new L.Bounds(a, b);
};


/*
 * L.Transformation is an utility class to perform simple point transformations through a 2d-matrix.
 */

L.Transformation = function (a, b, c, d) {
	this._a = a;
	this._b = b;
	this._c = c;
	this._d = d;
};

L.Transformation.prototype = {
	transform: function (point, scale) { // (Point, Number) -> Point
		return this._transform(point.clone(), scale);
	},

	// destructive transform (faster)
	_transform: function (point, scale) {
		scale = scale || 1;
		point.x = scale * (this._a * point.x + this._b);
		point.y = scale * (this._c * point.y + this._d);
		return point;
	},

	untransform: function (point, scale) {
		scale = scale || 1;
		return new L.Point(
		        (point.x / scale - this._b) / this._a,
		        (point.y / scale - this._d) / this._c);
	}
};


/*
 * L.DomUtil contains various utility functions for working with DOM.
 */

L.DomUtil = {
	get: function (id) {
		return (typeof id === 'string' ? document.getElementById(id) : id);
	},

	getStyle: function (el, style) {

		var value = el.style[style];

		if (!value && el.currentStyle) {
			value = el.currentStyle[style];
		}

		if ((!value || value === 'auto') && document.defaultView) {
			var css = document.defaultView.getComputedStyle(el, null);
			value = css ? css[style] : null;
		}

		return value === 'auto' ? null : value;
	},

	getViewportOffset: function (element) {

		var top = 0,
		    left = 0,
		    el = element,
		    docBody = document.body,
		    docEl = document.documentElement,
		    pos;

		do {
			top  += el.offsetTop  || 0;
			left += el.offsetLeft || 0;

			//add borders
			top += parseInt(L.DomUtil.getStyle(el, 'borderTopWidth'), 10) || 0;
			left += parseInt(L.DomUtil.getStyle(el, 'borderLeftWidth'), 10) || 0;

			pos = L.DomUtil.getStyle(el, 'position');

			if (el.offsetParent === docBody && pos === 'absolute') { break; }

			if (pos === 'fixed') {
				top  += docBody.scrollTop  || docEl.scrollTop  || 0;
				left += docBody.scrollLeft || docEl.scrollLeft || 0;
				break;
			}

			if (pos === 'relative' && !el.offsetLeft) {
				var width = L.DomUtil.getStyle(el, 'width'),
				    maxWidth = L.DomUtil.getStyle(el, 'max-width'),
				    r = el.getBoundingClientRect();

				if (width !== 'none' || maxWidth !== 'none') {
					left += r.left + el.clientLeft;
				}

				//calculate full y offset since we're breaking out of the loop
				top += r.top + (docBody.scrollTop  || docEl.scrollTop  || 0);

				break;
			}

			el = el.offsetParent;

		} while (el);

		el = element;

		do {
			if (el === docBody) { break; }

			top  -= el.scrollTop  || 0;
			left -= el.scrollLeft || 0;

			el = el.parentNode;
		} while (el);

		return new L.Point(left, top);
	},

	documentIsLtr: function () {
		if (!L.DomUtil._docIsLtrCached) {
			L.DomUtil._docIsLtrCached = true;
			L.DomUtil._docIsLtr = L.DomUtil.getStyle(document.body, 'direction') === 'ltr';
		}
		return L.DomUtil._docIsLtr;
	},

	create: function (tagName, className, container) {

		var el = document.createElement(tagName);
		el.className = className;

		if (container) {
			container.appendChild(el);
		}

		return el;
	},

	hasClass: function (el, name) {
		if (el.classList !== undefined) {
			return el.classList.contains(name);
		}
		var className = L.DomUtil._getClass(el);
		return className.length > 0 && new RegExp('(^|\\s)' + name + '(\\s|$)').test(className);
	},

	addClass: function (el, name) {
		if (el.classList !== undefined) {
			var classes = L.Util.splitWords(name);
			for (var i = 0, len = classes.length; i < len; i++) {
				el.classList.add(classes[i]);
			}
		} else if (!L.DomUtil.hasClass(el, name)) {
			var className = L.DomUtil._getClass(el);
			L.DomUtil._setClass(el, (className ? className + ' ' : '') + name);
		}
	},

	removeClass: function (el, name) {
		if (el.classList !== undefined) {
			el.classList.remove(name);
		} else {
			L.DomUtil._setClass(el, L.Util.trim((' ' + L.DomUtil._getClass(el) + ' ').replace(' ' + name + ' ', ' ')));
		}
	},

	_setClass: function (el, name) {
		if (el.className.baseVal === undefined) {
			el.className = name;
		} else {
			// in case of SVG element
			el.className.baseVal = name;
		}
	},

	_getClass: function (el) {
		return el.className.baseVal === undefined ? el.className : el.className.baseVal;
	},

	setOpacity: function (el, value) {

		if ('opacity' in el.style) {
			el.style.opacity = value;

		} else if ('filter' in el.style) {

			var filter = false,
			    filterName = 'DXImageTransform.Microsoft.Alpha';

			// filters collection throws an error if we try to retrieve a filter that doesn't exist
			try {
				filter = el.filters.item(filterName);
			} catch (e) {
				// don't set opacity to 1 if we haven't already set an opacity,
				// it isn't needed and breaks transparent pngs.
				if (value === 1) { return; }
			}

			value = Math.round(value * 100);

			if (filter) {
				filter.Enabled = (value !== 100);
				filter.Opacity = value;
			} else {
				el.style.filter += ' progid:' + filterName + '(opacity=' + value + ')';
			}
		}
	},

	testProp: function (props) {

		var style = document.documentElement.style;

		for (var i = 0; i < props.length; i++) {
			if (props[i] in style) {
				return props[i];
			}
		}
		return false;
	},

	getTranslateString: function (point) {
		// on WebKit browsers (Chrome/Safari/iOS Safari/Android) using translate3d instead of translate
		// makes animation smoother as it ensures HW accel is used. Firefox 13 doesn't care
		// (same speed either way), Opera 12 doesn't support translate3d

		var is3d = L.Browser.webkit3d,
		    open = 'translate' + (is3d ? '3d' : '') + '(',
		    close = (is3d ? ',0' : '') + ')';

		return open + point.x + 'px,' + point.y + 'px' + close;
	},

	getScaleString: function (scale, origin) {

		var preTranslateStr = L.DomUtil.getTranslateString(origin.add(origin.multiplyBy(-1 * scale))),
		    scaleStr = ' scale(' + scale + ') ';

		return preTranslateStr + scaleStr;
	},

	setPosition: function (el, point, disable3D) { // (HTMLElement, Point[, Boolean])

		// jshint camelcase: false
		el._leaflet_pos = point;

		if (!disable3D && L.Browser.any3d) {
			el.style[L.DomUtil.TRANSFORM] =  L.DomUtil.getTranslateString(point);
		} else {
			el.style.left = point.x + 'px';
			el.style.top = point.y + 'px';
		}
	},

	getPosition: function (el) {
		// this method is only used for elements previously positioned using setPosition,
		// so it's safe to cache the position for performance

		// jshint camelcase: false
		return el._leaflet_pos;
	}
};


// prefix style property names

L.DomUtil.TRANSFORM = L.DomUtil.testProp(
        ['transform', 'WebkitTransform', 'OTransform', 'MozTransform', 'msTransform']);

// webkitTransition comes first because some browser versions that drop vendor prefix don't do
// the same for the transitionend event, in particular the Android 4.1 stock browser

L.DomUtil.TRANSITION = L.DomUtil.testProp(
        ['webkitTransition', 'transition', 'OTransition', 'MozTransition', 'msTransition']);

L.DomUtil.TRANSITION_END =
        L.DomUtil.TRANSITION === 'webkitTransition' || L.DomUtil.TRANSITION === 'OTransition' ?
        L.DomUtil.TRANSITION + 'End' : 'transitionend';

(function () {
    if ('onselectstart' in document) {
        L.extend(L.DomUtil, {
            disableTextSelection: function () {
                L.DomEvent.on(window, 'selectstart', L.DomEvent.preventDefault);
            },

            enableTextSelection: function () {
                L.DomEvent.off(window, 'selectstart', L.DomEvent.preventDefault);
            }
        });
    } else {
        var userSelectProperty = L.DomUtil.testProp(
            ['userSelect', 'WebkitUserSelect', 'OUserSelect', 'MozUserSelect', 'msUserSelect']);

        L.extend(L.DomUtil, {
            disableTextSelection: function () {
                if (userSelectProperty) {
                    var style = document.documentElement.style;
                    this._userSelect = style[userSelectProperty];
                    style[userSelectProperty] = 'none';
                }
            },

            enableTextSelection: function () {
                if (userSelectProperty) {
                    document.documentElement.style[userSelectProperty] = this._userSelect;
                    delete this._userSelect;
                }
            }
        });
    }

	L.extend(L.DomUtil, {
		disableImageDrag: function () {
			L.DomEvent.on(window, 'dragstart', L.DomEvent.preventDefault);
		},

		enableImageDrag: function () {
			L.DomEvent.off(window, 'dragstart', L.DomEvent.preventDefault);
		}
	});
})();


/*
 * L.LatLng represents a geographical point with latitude and longitude coordinates.
 */

L.LatLng = function (lat, lng, alt) { // (Number, Number, Number)
	lat = parseFloat(lat);
	lng = parseFloat(lng);

	if (isNaN(lat) || isNaN(lng)) {
		throw new Error('Invalid LatLng object: (' + lat + ', ' + lng + ')');
	}

	this.lat = lat;
	this.lng = lng;

	if (alt !== undefined) {
		this.alt = parseFloat(alt);
	}
};

L.extend(L.LatLng, {
	DEG_TO_RAD: Math.PI / 180,
	RAD_TO_DEG: 180 / Math.PI,
	MAX_MARGIN: 1.0E-9 // max margin of error for the "equals" check
});

L.LatLng.prototype = {
	equals: function (obj) { // (LatLng) -> Boolean
		if (!obj) { return false; }

		obj = L.latLng(obj);

		var margin = Math.max(
		        Math.abs(this.lat - obj.lat),
		        Math.abs(this.lng - obj.lng));

		return margin <= L.LatLng.MAX_MARGIN;
	},

	toString: function (precision) { // (Number) -> String
		return 'LatLng(' +
		        L.Util.formatNum(this.lat, precision) + ', ' +
		        L.Util.formatNum(this.lng, precision) + ')';
	},

	// Haversine distance formula, see http://en.wikipedia.org/wiki/Haversine_formula
	// TODO move to projection code, LatLng shouldn't know about Earth
	distanceTo: function (other) { // (LatLng) -> Number
		other = L.latLng(other);

		var R = 6378137, // earth radius in meters
		    d2r = L.LatLng.DEG_TO_RAD,
		    dLat = (other.lat - this.lat) * d2r,
		    dLon = (other.lng - this.lng) * d2r,
		    lat1 = this.lat * d2r,
		    lat2 = other.lat * d2r,
		    sin1 = Math.sin(dLat / 2),
		    sin2 = Math.sin(dLon / 2);

		var a = sin1 * sin1 + sin2 * sin2 * Math.cos(lat1) * Math.cos(lat2);

		return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	},

	wrap: function (a, b) { // (Number, Number) -> LatLng
		var lng = this.lng;

		a = a || -180;
		b = b ||  180;

		lng = (lng + b) % (b - a) + (lng < a || lng === b ? b : a);

		return new L.LatLng(this.lat, lng);
	}
};

L.latLng = function (a, b) { // (LatLng) or ([Number, Number]) or (Number, Number)
	if (a instanceof L.LatLng) {
		return a;
	}
	if (L.Util.isArray(a)) {
		if (typeof a[0] === 'number' || typeof a[0] === 'string') {
			return new L.LatLng(a[0], a[1], a[2]);
		} else {
			return null;
		}
	}
	if (a === undefined || a === null) {
		return a;
	}
	if (typeof a === 'object' && 'lat' in a) {
		return new L.LatLng(a.lat, 'lng' in a ? a.lng : a.lon);
	}
	if (b === undefined) {
		return null;
	}
	return new L.LatLng(a, b);
};



/*
 * L.LatLngBounds represents a rectangular area on the map in geographical coordinates.
 */

L.LatLngBounds = function (southWest, northEast) { // (LatLng, LatLng) or (LatLng[])
	if (!southWest) { return; }

	var latlngs = northEast ? [southWest, northEast] : southWest;

	for (var i = 0, len = latlngs.length; i < len; i++) {
		this.extend(latlngs[i]);
	}
};

L.LatLngBounds.prototype = {
	// extend the bounds to contain the given point or bounds
	extend: function (obj) { // (LatLng) or (LatLngBounds)
		if (!obj) { return this; }

		var latLng = L.latLng(obj);
		if (latLng !== null) {
			obj = latLng;
		} else {
			obj = L.latLngBounds(obj);
		}

		if (obj instanceof L.LatLng) {
			if (!this._southWest && !this._northEast) {
				this._southWest = new L.LatLng(obj.lat, obj.lng);
				this._northEast = new L.LatLng(obj.lat, obj.lng);
			} else {
				this._southWest.lat = Math.min(obj.lat, this._southWest.lat);
				this._southWest.lng = Math.min(obj.lng, this._southWest.lng);

				this._northEast.lat = Math.max(obj.lat, this._northEast.lat);
				this._northEast.lng = Math.max(obj.lng, this._northEast.lng);
			}
		} else if (obj instanceof L.LatLngBounds) {
			this.extend(obj._southWest);
			this.extend(obj._northEast);
		}
		return this;
	},

	// extend the bounds by a percentage
	pad: function (bufferRatio) { // (Number) -> LatLngBounds
		var sw = this._southWest,
		    ne = this._northEast,
		    heightBuffer = Math.abs(sw.lat - ne.lat) * bufferRatio,
		    widthBuffer = Math.abs(sw.lng - ne.lng) * bufferRatio;

		return new L.LatLngBounds(
		        new L.LatLng(sw.lat - heightBuffer, sw.lng - widthBuffer),
		        new L.LatLng(ne.lat + heightBuffer, ne.lng + widthBuffer));
	},

	getCenter: function () { // -> LatLng
		return new L.LatLng(
		        (this._southWest.lat + this._northEast.lat) / 2,
		        (this._southWest.lng + this._northEast.lng) / 2);
	},

	getSouthWest: function () {
		return this._southWest;
	},

	getNorthEast: function () {
		return this._northEast;
	},

	getNorthWest: function () {
		return new L.LatLng(this.getNorth(), this.getWest());
	},

	getSouthEast: function () {
		return new L.LatLng(this.getSouth(), this.getEast());
	},

	getWest: function () {
		return this._southWest.lng;
	},

	getSouth: function () {
		return this._southWest.lat;
	},

	getEast: function () {
		return this._northEast.lng;
	},

	getNorth: function () {
		return this._northEast.lat;
	},

	contains: function (obj) { // (LatLngBounds) or (LatLng) -> Boolean
		if (typeof obj[0] === 'number' || obj instanceof L.LatLng) {
			obj = L.latLng(obj);
		} else {
			obj = L.latLngBounds(obj);
		}

		var sw = this._southWest,
		    ne = this._northEast,
		    sw2, ne2;

		if (obj instanceof L.LatLngBounds) {
			sw2 = obj.getSouthWest();
			ne2 = obj.getNorthEast();
		} else {
			sw2 = ne2 = obj;
		}

		return (sw2.lat >= sw.lat) && (ne2.lat <= ne.lat) &&
		       (sw2.lng >= sw.lng) && (ne2.lng <= ne.lng);
	},

	intersects: function (bounds) { // (LatLngBounds)
		bounds = L.latLngBounds(bounds);

		var sw = this._southWest,
		    ne = this._northEast,
		    sw2 = bounds.getSouthWest(),
		    ne2 = bounds.getNorthEast(),

		    latIntersects = (ne2.lat >= sw.lat) && (sw2.lat <= ne.lat),
		    lngIntersects = (ne2.lng >= sw.lng) && (sw2.lng <= ne.lng);

		return latIntersects && lngIntersects;
	},

	toBBoxString: function () {
		return [this.getWest(), this.getSouth(), this.getEast(), this.getNorth()].join(',');
	},

	equals: function (bounds) { // (LatLngBounds)
		if (!bounds) { return false; }

		bounds = L.latLngBounds(bounds);

		return this._southWest.equals(bounds.getSouthWest()) &&
		       this._northEast.equals(bounds.getNorthEast());
	},

	isValid: function () {
		return !!(this._southWest && this._northEast);
	}
};

//TODO International date line?

L.latLngBounds = function (a, b) { // (LatLngBounds) or (LatLng, LatLng)
	if (!a || a instanceof L.LatLngBounds) {
		return a;
	}
	return new L.LatLngBounds(a, b);
};


/*
 * L.Projection contains various geographical projections used by CRS classes.
 */

L.Projection = {};


/*
 * Spherical Mercator is the most popular map projection, used by EPSG:3857 CRS used by default.
 */

L.Projection.SphericalMercator = {
	MAX_LATITUDE: 85.0511287798,

	project: function (latlng) { // (LatLng) -> Point
		var d = L.LatLng.DEG_TO_RAD,
		    max = this.MAX_LATITUDE,
		    lat = Math.max(Math.min(max, latlng.lat), -max),
		    x = latlng.lng * d,
		    y = lat * d;

		y = Math.log(Math.tan((Math.PI / 4) + (y / 2)));

		return new L.Point(x, y);
	},

	unproject: function (point) { // (Point, Boolean) -> LatLng
		var d = L.LatLng.RAD_TO_DEG,
		    lng = point.x * d,
		    lat = (2 * Math.atan(Math.exp(point.y)) - (Math.PI / 2)) * d;

		return new L.LatLng(lat, lng);
	}
};


/*
 * Simple equirectangular (Plate Carree) projection, used by CRS like EPSG:4326 and Simple.
 */

L.Projection.LonLat = {
	project: function (latlng) {
		return new L.Point(latlng.lng, latlng.lat);
	},

	unproject: function (point) {
		return new L.LatLng(point.y, point.x);
	}
};


/*
 * L.CRS is a base object for all defined CRS (Coordinate Reference Systems) in Leaflet.
 */

L.CRS = {
	latLngToPoint: function (latlng, zoom) { // (LatLng, Number) -> Point
		var projectedPoint = this.projection.project(latlng),
		    scale = this.scale(zoom);

		return this.transformation._transform(projectedPoint, scale);
	},

	pointToLatLng: function (point, zoom) { // (Point, Number[, Boolean]) -> LatLng
		var scale = this.scale(zoom),
		    untransformedPoint = this.transformation.untransform(point, scale);

		return this.projection.unproject(untransformedPoint);
	},

	project: function (latlng) {
		return this.projection.project(latlng);
	},

	scale: function (zoom) {
		return 256 * Math.pow(2, zoom);
	},

	getSize: function (zoom) {
		var s = this.scale(zoom);
		return L.point(s, s);
	}
};


/*
 * A simple CRS that can be used for flat non-Earth maps like panoramas or game maps.
 */

L.CRS.Simple = L.extend({}, L.CRS, {
	projection: L.Projection.LonLat,
	transformation: new L.Transformation(1, 0, -1, 0),

	scale: function (zoom) {
		return Math.pow(2, zoom);
	}
});


/*
 * L.CRS.EPSG3857 (Spherical Mercator) is the most common CRS for web mapping
 * and is used by Leaflet by default.
 */

L.CRS.EPSG3857 = L.extend({}, L.CRS, {
	code: 'EPSG:3857',

	projection: L.Projection.SphericalMercator,
	transformation: new L.Transformation(0.5 / Math.PI, 0.5, -0.5 / Math.PI, 0.5),

	project: function (latlng) { // (LatLng) -> Point
		var projectedPoint = this.projection.project(latlng),
		    earthRadius = 6378137;
		return projectedPoint.multiplyBy(earthRadius);
	}
});

L.CRS.EPSG900913 = L.extend({}, L.CRS.EPSG3857, {
	code: 'EPSG:900913'
});


/*
 * L.CRS.EPSG4326 is a CRS popular among advanced GIS specialists.
 */

L.CRS.EPSG4326 = L.extend({}, L.CRS, {
	code: 'EPSG:4326',

	projection: L.Projection.LonLat,
	transformation: new L.Transformation(1 / 360, 0.5, -1 / 360, 0.5)
});


/*
 * L.Map is the central class of the API - it is used to create a map.
 */

L.Map = L.Class.extend({

	includes: L.Mixin.Events,

	options: {
		crs: L.CRS.EPSG3857,

		/*
		center: LatLng,
		zoom: Number,
		layers: Array,
		*/

		fadeAnimation: L.DomUtil.TRANSITION && !L.Browser.android23,
		trackResize: true,
		markerZoomAnimation: L.DomUtil.TRANSITION && L.Browser.any3d
	},

	initialize: function (id, options) { // (HTMLElement or String, Object)
		options = L.setOptions(this, options);


		this._initContainer(id);
		this._initLayout();

		// hack for https://github.com/Leaflet/Leaflet/issues/1980
		this._onResize = L.bind(this._onResize, this);

		this._initEvents();

		if (options.maxBounds) {
			this.setMaxBounds(options.maxBounds);
		}

		if (options.center && options.zoom !== undefined) {
			this.setView(L.latLng(options.center), options.zoom, {reset: true});
		}

		this._handlers = [];

		this._layers = {};
		this._zoomBoundLayers = {};
		this._tileLayersNum = 0;

		this.callInitHooks();

		this._addLayers(options.layers);
	},


	// public methods that modify map state

	// replaced by animation-powered implementation in Map.PanAnimation.js
	setView: function (center, zoom) {
		zoom = zoom === undefined ? this.getZoom() : zoom;
		this._resetView(L.latLng(center), this._limitZoom(zoom));
		return this;
	},

	setZoom: function (zoom, options) {
		if (!this._loaded) {
			this._zoom = this._limitZoom(zoom);
			return this;
		}
		return this.setView(this.getCenter(), zoom, {zoom: options});
	},

	zoomIn: function (delta, options) {
		return this.setZoom(this._zoom + (delta || 1), options);
	},

	zoomOut: function (delta, options) {
		return this.setZoom(this._zoom - (delta || 1), options);
	},

	setZoomAround: function (latlng, zoom, options) {
		var scale = this.getZoomScale(zoom),
		    viewHalf = this.getSize().divideBy(2),
		    containerPoint = latlng instanceof L.Point ? latlng : this.latLngToContainerPoint(latlng),

		    centerOffset = containerPoint.subtract(viewHalf).multiplyBy(1 - 1 / scale),
		    newCenter = this.containerPointToLatLng(viewHalf.add(centerOffset));

		return this.setView(newCenter, zoom, {zoom: options});
	},

	fitBounds: function (bounds, options) {

		options = options || {};
		bounds = bounds.getBounds ? bounds.getBounds() : L.latLngBounds(bounds);

		var paddingTL = L.point(options.paddingTopLeft || options.padding || [0, 0]),
		    paddingBR = L.point(options.paddingBottomRight || options.padding || [0, 0]),

		    zoom = this.getBoundsZoom(bounds, false, paddingTL.add(paddingBR)),
		    paddingOffset = paddingBR.subtract(paddingTL).divideBy(2),

		    swPoint = this.project(bounds.getSouthWest(), zoom),
		    nePoint = this.project(bounds.getNorthEast(), zoom),
		    center = this.unproject(swPoint.add(nePoint).divideBy(2).add(paddingOffset), zoom);

		zoom = options && options.maxZoom ? Math.min(options.maxZoom, zoom) : zoom;

		return this.setView(center, zoom, options);
	},

	fitWorld: function (options) {
		return this.fitBounds([[-90, -180], [90, 180]], options);
	},

	panTo: function (center, options) { // (LatLng)
		return this.setView(center, this._zoom, {pan: options});
	},

	panBy: function (offset) { // (Point)
		// replaced with animated panBy in Map.PanAnimation.js
		this.fire('movestart');

		this._rawPanBy(L.point(offset));

		this.fire('move');
		return this.fire('moveend');
	},

	setMaxBounds: function (bounds) {
		bounds = L.latLngBounds(bounds);

		this.options.maxBounds = bounds;

		if (!bounds) {
			return this.off('moveend', this._panInsideMaxBounds, this);
		}

		if (this._loaded) {
			this._panInsideMaxBounds();
		}

		return this.on('moveend', this._panInsideMaxBounds, this);
	},

	panInsideBounds: function (bounds, options) {
		var center = this.getCenter(),
			newCenter = this._limitCenter(center, this._zoom, bounds);

		if (center.equals(newCenter)) { return this; }

		return this.panTo(newCenter, options);
	},

	addLayer: function (layer) {
		// TODO method is too big, refactor

		var id = L.stamp(layer);

		if (this._layers[id]) { return this; }

		this._layers[id] = layer;

		// TODO getMaxZoom, getMinZoom in ILayer (instead of options)
		if (layer.options && (!isNaN(layer.options.maxZoom) || !isNaN(layer.options.minZoom))) {
			this._zoomBoundLayers[id] = layer;
			this._updateZoomLevels();
		}

		// TODO looks ugly, refactor!!!
		if (this.options.zoomAnimation && L.TileLayer && (layer instanceof L.TileLayer)) {
			this._tileLayersNum++;
			this._tileLayersToLoad++;
			layer.on('load', this._onTileLayerLoad, this);
		}

		if (this._loaded) {
			this._layerAdd(layer);
		}

		return this;
	},

	removeLayer: function (layer) {
		var id = L.stamp(layer);

		if (!this._layers[id]) { return this; }

		if (this._loaded) {
			layer.onRemove(this);
		}

		delete this._layers[id];

		if (this._loaded) {
			this.fire('layerremove', {layer: layer});
		}

		if (this._zoomBoundLayers[id]) {
			delete this._zoomBoundLayers[id];
			this._updateZoomLevels();
		}

		// TODO looks ugly, refactor
		if (this.options.zoomAnimation && L.TileLayer && (layer instanceof L.TileLayer)) {
			this._tileLayersNum--;
			this._tileLayersToLoad--;
			layer.off('load', this._onTileLayerLoad, this);
		}

		return this;
	},

	hasLayer: function (layer) {
		if (!layer) { return false; }

		return (L.stamp(layer) in this._layers);
	},

	eachLayer: function (method, context) {
		for (var i in this._layers) {
			method.call(context, this._layers[i]);
		}
		return this;
	},

	invalidateSize: function (options) {
		if (!this._loaded) { return this; }

		options = L.extend({
			animate: false,
			pan: true
		}, options === true ? {animate: true} : options);

		var oldSize = this.getSize();
		this._sizeChanged = true;
		this._initialCenter = null;

		var newSize = this.getSize(),
		    oldCenter = oldSize.divideBy(2).round(),
		    newCenter = newSize.divideBy(2).round(),
		    offset = oldCenter.subtract(newCenter);

		if (!offset.x && !offset.y) { return this; }

		if (options.animate && options.pan) {
			this.panBy(offset);

		} else {
			if (options.pan) {
				this._rawPanBy(offset);
			}

			this.fire('move');

			if (options.debounceMoveend) {
				clearTimeout(this._sizeTimer);
				this._sizeTimer = setTimeout(L.bind(this.fire, this, 'moveend'), 200);
			} else {
				this.fire('moveend');
			}
		}

		return this.fire('resize', {
			oldSize: oldSize,
			newSize: newSize
		});
	},

	// TODO handler.addTo
	addHandler: function (name, HandlerClass) {
		if (!HandlerClass) { return this; }

		var handler = this[name] = new HandlerClass(this);

		this._handlers.push(handler);

		if (this.options[name]) {
			handler.enable();
		}

		return this;
	},

	remove: function () {
		if (this._loaded) {
			this.fire('unload');
		}

		this._initEvents('off');

		try {
			// throws error in IE6-8
			delete this._container._leaflet;
		} catch (e) {
			this._container._leaflet = undefined;
		}

		this._clearPanes();
		if (this._clearControlPos) {
			this._clearControlPos();
		}

		this._clearHandlers();

		return this;
	},


	// public methods for getting map state

	getCenter: function () { // (Boolean) -> LatLng
		this._checkIfLoaded();

		if (this._initialCenter && !this._moved()) {
			return this._initialCenter;
		}
		return this.layerPointToLatLng(this._getCenterLayerPoint());
	},

	getZoom: function () {
		return this._zoom;
	},

	getBounds: function () {
		var bounds = this.getPixelBounds(),
		    sw = this.unproject(bounds.getBottomLeft()),
		    ne = this.unproject(bounds.getTopRight());

		return new L.LatLngBounds(sw, ne);
	},

	getMinZoom: function () {
		return this.options.minZoom === undefined ?
			(this._layersMinZoom === undefined ? 0 : this._layersMinZoom) :
			this.options.minZoom;
	},

	getMaxZoom: function () {
		return this.options.maxZoom === undefined ?
			(this._layersMaxZoom === undefined ? Infinity : this._layersMaxZoom) :
			this.options.maxZoom;
	},

	getBoundsZoom: function (bounds, inside, padding) { // (LatLngBounds[, Boolean, Point]) -> Number
		bounds = L.latLngBounds(bounds);

		var zoom = this.getMinZoom() - (inside ? 1 : 0),
		    maxZoom = this.getMaxZoom(),
		    size = this.getSize(),

		    nw = bounds.getNorthWest(),
		    se = bounds.getSouthEast(),

		    zoomNotFound = true,
		    boundsSize;

		padding = L.point(padding || [0, 0]);

		do {
			zoom++;
			boundsSize = this.project(se, zoom).subtract(this.project(nw, zoom)).add(padding);
			zoomNotFound = !inside ? size.contains(boundsSize) : boundsSize.x < size.x || boundsSize.y < size.y;

		} while (zoomNotFound && zoom <= maxZoom);

		if (zoomNotFound && inside) {
			return null;
		}

		return inside ? zoom : zoom - 1;
	},

	getSize: function () {
		if (!this._size || this._sizeChanged) {
			this._size = new L.Point(
				this._container.clientWidth,
				this._container.clientHeight);

			this._sizeChanged = false;
		}
		return this._size.clone();
	},

	getPixelBounds: function () {
		var topLeftPoint = this._getTopLeftPoint();
		return new L.Bounds(topLeftPoint, topLeftPoint.add(this.getSize()));
	},

	getPixelOrigin: function () {
		this._checkIfLoaded();
		return this._initialTopLeftPoint;
	},

	getPanes: function () {
		return this._panes;
	},

	getContainer: function () {
		return this._container;
	},


	// TODO replace with universal implementation after refactoring projections

	getZoomScale: function (toZoom) {
		var crs = this.options.crs;
		return crs.scale(toZoom) / crs.scale(this._zoom);
	},

	getScaleZoom: function (scale) {
		return this._zoom + (Math.log(scale) / Math.LN2);
	},


	// conversion methods

	project: function (latlng, zoom) { // (LatLng[, Number]) -> Point
		zoom = zoom === undefined ? this._zoom : zoom;
		return this.options.crs.latLngToPoint(L.latLng(latlng), zoom);
	},

	unproject: function (point, zoom) { // (Point[, Number]) -> LatLng
		zoom = zoom === undefined ? this._zoom : zoom;
		return this.options.crs.pointToLatLng(L.point(point), zoom);
	},

	layerPointToLatLng: function (point) { // (Point)
		var projectedPoint = L.point(point).add(this.getPixelOrigin());
		return this.unproject(projectedPoint);
	},

	latLngToLayerPoint: function (latlng) { // (LatLng)
		var projectedPoint = this.project(L.latLng(latlng))._round();
		return projectedPoint._subtract(this.getPixelOrigin());
	},

	containerPointToLayerPoint: function (point) { // (Point)
		return L.point(point).subtract(this._getMapPanePos());
	},

	layerPointToContainerPoint: function (point) { // (Point)
		return L.point(point).add(this._getMapPanePos());
	},

	containerPointToLatLng: function (point) {
		var layerPoint = this.containerPointToLayerPoint(L.point(point));
		return this.layerPointToLatLng(layerPoint);
	},

	latLngToContainerPoint: function (latlng) {
		return this.layerPointToContainerPoint(this.latLngToLayerPoint(L.latLng(latlng)));
	},

	mouseEventToContainerPoint: function (e) { // (MouseEvent)
		return L.DomEvent.getMousePosition(e, this._container);
	},

	mouseEventToLayerPoint: function (e) { // (MouseEvent)
		return this.containerPointToLayerPoint(this.mouseEventToContainerPoint(e));
	},

	mouseEventToLatLng: function (e) { // (MouseEvent)
		return this.layerPointToLatLng(this.mouseEventToLayerPoint(e));
	},


	// map initialization methods

	_initContainer: function (id) {
		var container = this._container = L.DomUtil.get(id);

		if (!container) {
			throw new Error('Map container not found.');
		} else if (container._leaflet) {
			throw new Error('Map container is already initialized.');
		}

		container._leaflet = true;
	},

	_initLayout: function () {
		var container = this._container;

		L.DomUtil.addClass(container, 'leaflet-container' +
			(L.Browser.touch ? ' leaflet-touch' : '') +
			(L.Browser.retina ? ' leaflet-retina' : '') +
			(L.Browser.ielt9 ? ' leaflet-oldie' : '') +
			(this.options.fadeAnimation ? ' leaflet-fade-anim' : ''));

		var position = L.DomUtil.getStyle(container, 'position');

		if (position !== 'absolute' && position !== 'relative' && position !== 'fixed') {
			container.style.position = 'relative';
		}

		this._initPanes();

		if (this._initControlPos) {
			this._initControlPos();
		}
	},

	_initPanes: function () {
		var panes = this._panes = {};

		this._mapPane = panes.mapPane = this._createPane('leaflet-map-pane', this._container);

		this._tilePane = panes.tilePane = this._createPane('leaflet-tile-pane', this._mapPane);
		panes.objectsPane = this._createPane('leaflet-objects-pane', this._mapPane);
		panes.shadowPane = this._createPane('leaflet-shadow-pane');
		panes.overlayPane = this._createPane('leaflet-overlay-pane');
		panes.markerPane = this._createPane('leaflet-marker-pane');
		panes.popupPane = this._createPane('leaflet-popup-pane');

		var zoomHide = ' leaflet-zoom-hide';

		if (!this.options.markerZoomAnimation) {
			L.DomUtil.addClass(panes.markerPane, zoomHide);
			L.DomUtil.addClass(panes.shadowPane, zoomHide);
			L.DomUtil.addClass(panes.popupPane, zoomHide);
		}
	},

	_createPane: function (className, container) {
		return L.DomUtil.create('div', className, container || this._panes.objectsPane);
	},

	_clearPanes: function () {
		this._container.removeChild(this._mapPane);
	},

	_addLayers: function (layers) {
		layers = layers ? (L.Util.isArray(layers) ? layers : [layers]) : [];

		for (var i = 0, len = layers.length; i < len; i++) {
			this.addLayer(layers[i]);
		}
	},


	// private methods that modify map state

	_resetView: function (center, zoom, preserveMapOffset, afterZoomAnim) {

		var zoomChanged = (this._zoom !== zoom);

		if (!afterZoomAnim) {
			this.fire('movestart');

			if (zoomChanged) {
				this.fire('zoomstart');
			}
		}

		this._zoom = zoom;
		this._initialCenter = center;

		this._initialTopLeftPoint = this._getNewTopLeftPoint(center);

		if (!preserveMapOffset) {
			L.DomUtil.setPosition(this._mapPane, new L.Point(0, 0));
		} else {
			this._initialTopLeftPoint._add(this._getMapPanePos());
		}

		this._tileLayersToLoad = this._tileLayersNum;

		var loading = !this._loaded;
		this._loaded = true;

		this.fire('viewreset', {hard: !preserveMapOffset});

		if (loading) {
			this.fire('load');
			this.eachLayer(this._layerAdd, this);
		}

		this.fire('move');

		if (zoomChanged || afterZoomAnim) {
			this.fire('zoomend');
		}

		this.fire('moveend', {hard: !preserveMapOffset});
	},

	_rawPanBy: function (offset) {
		L.DomUtil.setPosition(this._mapPane, this._getMapPanePos().subtract(offset));
	},

	_getZoomSpan: function () {
		return this.getMaxZoom() - this.getMinZoom();
	},

	_updateZoomLevels: function () {
		var i,
			minZoom = Infinity,
			maxZoom = -Infinity,
			oldZoomSpan = this._getZoomSpan();

		for (i in this._zoomBoundLayers) {
			var layer = this._zoomBoundLayers[i];
			if (!isNaN(layer.options.minZoom)) {
				minZoom = Math.min(minZoom, layer.options.minZoom);
			}
			if (!isNaN(layer.options.maxZoom)) {
				maxZoom = Math.max(maxZoom, layer.options.maxZoom);
			}
		}

		if (i === undefined) { // we have no tilelayers
			this._layersMaxZoom = this._layersMinZoom = undefined;
		} else {
			this._layersMaxZoom = maxZoom;
			this._layersMinZoom = minZoom;
		}

		if (oldZoomSpan !== this._getZoomSpan()) {
			this.fire('zoomlevelschange');
		}
	},

	_panInsideMaxBounds: function () {
		this.panInsideBounds(this.options.maxBounds);
	},

	_checkIfLoaded: function () {
		if (!this._loaded) {
			throw new Error('Set map center and zoom first.');
		}
	},

	// map events

	_initEvents: function (onOff) {
		if (!L.DomEvent) { return; }

		onOff = onOff || 'on';

		L.DomEvent[onOff](this._container, 'click', this._onMouseClick, this);

		var events = ['dblclick', 'mousedown', 'mouseup', 'mouseenter',
		              'mouseleave', 'mousemove', 'contextmenu'],
		    i, len;

		for (i = 0, len = events.length; i < len; i++) {
			L.DomEvent[onOff](this._container, events[i], this._fireMouseEvent, this);
		}

		if (this.options.trackResize) {
			L.DomEvent[onOff](window, 'resize', this._onResize, this);
		}
	},

	_onResize: function () {
		L.Util.cancelAnimFrame(this._resizeRequest);
		this._resizeRequest = L.Util.requestAnimFrame(
		        function () { this.invalidateSize({debounceMoveend: true}); }, this, false, this._container);
	},

	_onMouseClick: function (e) {
		if (!this._loaded || (!e._simulated &&
		        ((this.dragging && this.dragging.moved()) ||
		         (this.boxZoom  && this.boxZoom.moved()))) ||
		            L.DomEvent._skipped(e)) { return; }

		this.fire('preclick');
		this._fireMouseEvent(e);
	},

	_fireMouseEvent: function (e) {
		if (!this._loaded || L.DomEvent._skipped(e)) { return; }

		var type = e.type;

		type = (type === 'mouseenter' ? 'mouseover' : (type === 'mouseleave' ? 'mouseout' : type));

		if (!this.hasEventListeners(type)) { return; }

		if (type === 'contextmenu') {
			L.DomEvent.preventDefault(e);
		}

		var containerPoint = this.mouseEventToContainerPoint(e),
		    layerPoint = this.containerPointToLayerPoint(containerPoint),
		    latlng = this.layerPointToLatLng(layerPoint);

		this.fire(type, {
			latlng: latlng,
			layerPoint: layerPoint,
			containerPoint: containerPoint,
			originalEvent: e
		});
	},

	_onTileLayerLoad: function () {
		this._tileLayersToLoad--;
		if (this._tileLayersNum && !this._tileLayersToLoad) {
			this.fire('tilelayersload');
		}
	},

	_clearHandlers: function () {
		for (var i = 0, len = this._handlers.length; i < len; i++) {
			this._handlers[i].disable();
		}
	},

	whenReady: function (callback, context) {
		if (this._loaded) {
			callback.call(context || this, this);
		} else {
			this.on('load', callback, context);
		}
		return this;
	},

	_layerAdd: function (layer) {
		layer.onAdd(this);
		this.fire('layeradd', {layer: layer});
	},


	// private methods for getting map state

	_getMapPanePos: function () {
		return L.DomUtil.getPosition(this._mapPane);
	},

	_moved: function () {
		var pos = this._getMapPanePos();
		return pos && !pos.equals([0, 0]);
	},

	_getTopLeftPoint: function () {
		return this.getPixelOrigin().subtract(this._getMapPanePos());
	},

	_getNewTopLeftPoint: function (center, zoom) {
		var viewHalf = this.getSize()._divideBy(2);
		// TODO round on display, not calculation to increase precision?
		return this.project(center, zoom)._subtract(viewHalf)._round();
	},

	_latLngToNewLayerPoint: function (latlng, newZoom, newCenter) {
		var topLeft = this._getNewTopLeftPoint(newCenter, newZoom).add(this._getMapPanePos());
		return this.project(latlng, newZoom)._subtract(topLeft);
	},

	// layer point of the current center
	_getCenterLayerPoint: function () {
		return this.containerPointToLayerPoint(this.getSize()._divideBy(2));
	},

	// offset of the specified place to the current center in pixels
	_getCenterOffset: function (latlng) {
		return this.latLngToLayerPoint(latlng).subtract(this._getCenterLayerPoint());
	},

	// adjust center for view to get inside bounds
	_limitCenter: function (center, zoom, bounds) {

		if (!bounds) { return center; }

		var centerPoint = this.project(center, zoom),
		    viewHalf = this.getSize().divideBy(2),
		    viewBounds = new L.Bounds(centerPoint.subtract(viewHalf), centerPoint.add(viewHalf)),
		    offset = this._getBoundsOffset(viewBounds, bounds, zoom);

		return this.unproject(centerPoint.add(offset), zoom);
	},

	// adjust offset for view to get inside bounds
	_limitOffset: function (offset, bounds) {
		if (!bounds) { return offset; }

		var viewBounds = this.getPixelBounds(),
		    newBounds = new L.Bounds(viewBounds.min.add(offset), viewBounds.max.add(offset));

		return offset.add(this._getBoundsOffset(newBounds, bounds));
	},

	// returns offset needed for pxBounds to get inside maxBounds at a specified zoom
	_getBoundsOffset: function (pxBounds, maxBounds, zoom) {
		var nwOffset = this.project(maxBounds.getNorthWest(), zoom).subtract(pxBounds.min),
		    seOffset = this.project(maxBounds.getSouthEast(), zoom).subtract(pxBounds.max),

		    dx = this._rebound(nwOffset.x, -seOffset.x),
		    dy = this._rebound(nwOffset.y, -seOffset.y);

		return new L.Point(dx, dy);
	},

	_rebound: function (left, right) {
		return left + right > 0 ?
			Math.round(left - right) / 2 :
			Math.max(0, Math.ceil(left)) - Math.max(0, Math.floor(right));
	},

	_limitZoom: function (zoom) {
		var min = this.getMinZoom(),
		    max = this.getMaxZoom();

		return Math.max(min, Math.min(max, zoom));
	}
});

L.map = function (id, options) {
	return new L.Map(id, options);
};


/*
 * Mercator projection that takes into account that the Earth is not a perfect sphere.
 * Less popular than spherical mercator; used by projections like EPSG:3395.
 */

L.Projection.Mercator = {
	MAX_LATITUDE: 85.0840591556,

	R_MINOR: 6356752.314245179,
	R_MAJOR: 6378137,

	project: function (latlng) { // (LatLng) -> Point
		var d = L.LatLng.DEG_TO_RAD,
		    max = this.MAX_LATITUDE,
		    lat = Math.max(Math.min(max, latlng.lat), -max),
		    r = this.R_MAJOR,
		    r2 = this.R_MINOR,
		    x = latlng.lng * d * r,
		    y = lat * d,
		    tmp = r2 / r,
		    eccent = Math.sqrt(1.0 - tmp * tmp),
		    con = eccent * Math.sin(y);

		con = Math.pow((1 - con) / (1 + con), eccent * 0.5);

		var ts = Math.tan(0.5 * ((Math.PI * 0.5) - y)) / con;
		y = -r * Math.log(ts);

		return new L.Point(x, y);
	},

	unproject: function (point) { // (Point, Boolean) -> LatLng
		var d = L.LatLng.RAD_TO_DEG,
		    r = this.R_MAJOR,
		    r2 = this.R_MINOR,
		    lng = point.x * d / r,
		    tmp = r2 / r,
		    eccent = Math.sqrt(1 - (tmp * tmp)),
		    ts = Math.exp(- point.y / r),
		    phi = (Math.PI / 2) - 2 * Math.atan(ts),
		    numIter = 15,
		    tol = 1e-7,
		    i = numIter,
		    dphi = 0.1,
		    con;

		while ((Math.abs(dphi) > tol) && (--i > 0)) {
			con = eccent * Math.sin(phi);
			dphi = (Math.PI / 2) - 2 * Math.atan(ts *
			            Math.pow((1.0 - con) / (1.0 + con), 0.5 * eccent)) - phi;
			phi += dphi;
		}

		return new L.LatLng(phi * d, lng);
	}
};



L.CRS.EPSG3395 = L.extend({}, L.CRS, {
	code: 'EPSG:3395',

	projection: L.Projection.Mercator,

	transformation: (function () {
		var m = L.Projection.Mercator,
		    r = m.R_MAJOR,
		    scale = 0.5 / (Math.PI * r);

		return new L.Transformation(scale, 0.5, -scale, 0.5);
	}())
});


/*
 * L.TileLayer is used for standard xyz-numbered tile layers.
 */

L.TileLayer = L.Class.extend({
	includes: L.Mixin.Events,

	options: {
		minZoom: 0,
		maxZoom: 18,
		tileSize: 256,
		subdomains: 'abc',
		errorTileUrl: '',
		attribution: '',
		zoomOffset: 0,
		opacity: 1,
		/*
		maxNativeZoom: null,
		zIndex: null,
		tms: false,
		continuousWorld: false,
		noWrap: false,
		zoomReverse: false,
		detectRetina: false,
		reuseTiles: false,
		bounds: false,
		*/
		unloadInvisibleTiles: L.Browser.mobile,
		updateWhenIdle: L.Browser.mobile
	},

	initialize: function (url, options) {
		options = L.setOptions(this, options);

		// detecting retina displays, adjusting tileSize and zoom levels
		if (options.detectRetina && L.Browser.retina && options.maxZoom > 0) {

			options.tileSize = Math.floor(options.tileSize / 2);
			options.zoomOffset++;

			if (options.minZoom > 0) {
				options.minZoom--;
			}
			this.options.maxZoom--;
		}

		if (options.bounds) {
			options.bounds = L.latLngBounds(options.bounds);
		}

		this._url = url;

		var subdomains = this.options.subdomains;

		if (typeof subdomains === 'string') {
			this.options.subdomains = subdomains.split('');
		}
	},

	onAdd: function (map) {
		this._map = map;
		this._animated = map._zoomAnimated;

		// create a container div for tiles
		this._initContainer();

		// set up events
		map.on({
			'viewreset': this._reset,
			'moveend': this._update
		}, this);

		if (this._animated) {
			map.on({
				'zoomanim': this._animateZoom,
				'zoomend': this._endZoomAnim
			}, this);
		}

		if (!this.options.updateWhenIdle) {
			this._limitedUpdate = L.Util.limitExecByInterval(this._update, 150, this);
			map.on('move', this._limitedUpdate, this);
		}

		this._reset();
		this._update();
	},

	addTo: function (map) {
		map.addLayer(this);
		return this;
	},

	onRemove: function (map) {
		this._container.parentNode.removeChild(this._container);

		map.off({
			'viewreset': this._reset,
			'moveend': this._update
		}, this);

		if (this._animated) {
			map.off({
				'zoomanim': this._animateZoom,
				'zoomend': this._endZoomAnim
			}, this);
		}

		if (!this.options.updateWhenIdle) {
			map.off('move', this._limitedUpdate, this);
		}

		this._container = null;
		this._map = null;
	},

	bringToFront: function () {
		var pane = this._map._panes.tilePane;

		if (this._container) {
			pane.appendChild(this._container);
			this._setAutoZIndex(pane, Math.max);
		}

		return this;
	},

	bringToBack: function () {
		var pane = this._map._panes.tilePane;

		if (this._container) {
			pane.insertBefore(this._container, pane.firstChild);
			this._setAutoZIndex(pane, Math.min);
		}

		return this;
	},

	getAttribution: function () {
		return this.options.attribution;
	},

	getContainer: function () {
		return this._container;
	},

	setOpacity: function (opacity) {
		this.options.opacity = opacity;

		if (this._map) {
			this._updateOpacity();
		}

		return this;
	},

	setZIndex: function (zIndex) {
		this.options.zIndex = zIndex;
		this._updateZIndex();

		return this;
	},

	setUrl: function (url, noRedraw) {
		this._url = url;

		if (!noRedraw) {
			this.redraw();
		}

		return this;
	},

	redraw: function () {
		if (this._map) {
			this._reset({hard: true});
			this._update();
		}
		return this;
	},

	_updateZIndex: function () {
		if (this._container && this.options.zIndex !== undefined) {
			this._container.style.zIndex = this.options.zIndex;
		}
	},

	_setAutoZIndex: function (pane, compare) {

		var layers = pane.children,
		    edgeZIndex = -compare(Infinity, -Infinity), // -Infinity for max, Infinity for min
		    zIndex, i, len;

		for (i = 0, len = layers.length; i < len; i++) {

			if (layers[i] !== this._container) {
				zIndex = parseInt(layers[i].style.zIndex, 10);

				if (!isNaN(zIndex)) {
					edgeZIndex = compare(edgeZIndex, zIndex);
				}
			}
		}

		this.options.zIndex = this._container.style.zIndex =
		        (isFinite(edgeZIndex) ? edgeZIndex : 0) + compare(1, -1);
	},

	_updateOpacity: function () {
		var i,
		    tiles = this._tiles;

		if (L.Browser.ielt9) {
			for (i in tiles) {
				L.DomUtil.setOpacity(tiles[i], this.options.opacity);
			}
		} else {
			L.DomUtil.setOpacity(this._container, this.options.opacity);
		}
	},

	_initContainer: function () {
		var tilePane = this._map._panes.tilePane;

		if (!this._container) {
			this._container = L.DomUtil.create('div', 'leaflet-layer');

			this._updateZIndex();

			if (this._animated) {
				var className = 'leaflet-tile-container';

				this._bgBuffer = L.DomUtil.create('div', className, this._container);
				this._tileContainer = L.DomUtil.create('div', className, this._container);

			} else {
				this._tileContainer = this._container;
			}

			tilePane.appendChild(this._container);

			if (this.options.opacity < 1) {
				this._updateOpacity();
			}
		}
	},

	_reset: function (e) {
		for (var key in this._tiles) {
			this.fire('tileunload', {tile: this._tiles[key]});
		}

		this._tiles = {};
		this._tilesToLoad = 0;

		if (this.options.reuseTiles) {
			this._unusedTiles = [];
		}

		this._tileContainer.innerHTML = '';

		if (this._animated && e && e.hard) {
			this._clearBgBuffer();
		}

		this._initContainer();
	},

	_getTileSize: function () {
		var map = this._map,
		    zoom = map.getZoom() + this.options.zoomOffset,
		    zoomN = this.options.maxNativeZoom,
		    tileSize = this.options.tileSize;

		if (zoomN && zoom > zoomN) {
			tileSize = Math.round(map.getZoomScale(zoom) / map.getZoomScale(zoomN) * tileSize);
		}

		return tileSize;
	},

	_update: function () {

		if (!this._map) { return; }

		var map = this._map,
		    bounds = map.getPixelBounds(),
		    zoom = map.getZoom(),
		    tileSize = this._getTileSize();

		if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
			return;
		}

		var tileBounds = L.bounds(
		        bounds.min.divideBy(tileSize)._floor(),
		        bounds.max.divideBy(tileSize)._floor());

		this._addTilesFromCenterOut(tileBounds);

		if (this.options.unloadInvisibleTiles || this.options.reuseTiles) {
			this._removeOtherTiles(tileBounds);
		}
	},

	_addTilesFromCenterOut: function (bounds) {
		var queue = [],
		    center = bounds.getCenter();

		var j, i, point;

		for (j = bounds.min.y; j <= bounds.max.y; j++) {
			for (i = bounds.min.x; i <= bounds.max.x; i++) {
				point = new L.Point(i, j);

				if (this._tileShouldBeLoaded(point)) {
					queue.push(point);
				}
			}
		}

		var tilesToLoad = queue.length;

		if (tilesToLoad === 0) { return; }

		// load tiles in order of their distance to center
		queue.sort(function (a, b) {
			return a.distanceTo(center) - b.distanceTo(center);
		});

		var fragment = document.createDocumentFragment();

		// if its the first batch of tiles to load
		if (!this._tilesToLoad) {
			this.fire('loading');
		}

		this._tilesToLoad += tilesToLoad;

		for (i = 0; i < tilesToLoad; i++) {
			this._addTile(queue[i], fragment);
		}

		this._tileContainer.appendChild(fragment);
	},

	_tileShouldBeLoaded: function (tilePoint) {
		if ((tilePoint.x + ':' + tilePoint.y) in this._tiles) {
			return false; // already loaded
		}

		var options = this.options;

		if (!options.continuousWorld) {
			var limit = this._getWrapTileNum();

			// don't load if exceeds world bounds
			if ((options.noWrap && (tilePoint.x < 0 || tilePoint.x >= limit.x)) ||
				tilePoint.y < 0 || tilePoint.y >= limit.y) { return false; }
		}

		if (options.bounds) {
			var tileSize = options.tileSize,
			    nwPoint = tilePoint.multiplyBy(tileSize),
			    sePoint = nwPoint.add([tileSize, tileSize]),
			    nw = this._map.unproject(nwPoint),
			    se = this._map.unproject(sePoint);

			// TODO temporary hack, will be removed after refactoring projections
			// https://github.com/Leaflet/Leaflet/issues/1618
			if (!options.continuousWorld && !options.noWrap) {
				nw = nw.wrap();
				se = se.wrap();
			}

			if (!options.bounds.intersects([nw, se])) { return false; }
		}

		return true;
	},

	_removeOtherTiles: function (bounds) {
		var kArr, x, y, key;

		for (key in this._tiles) {
			kArr = key.split(':');
			x = parseInt(kArr[0], 10);
			y = parseInt(kArr[1], 10);

			// remove tile if it's out of bounds
			if (x < bounds.min.x || x > bounds.max.x || y < bounds.min.y || y > bounds.max.y) {
				this._removeTile(key);
			}
		}
	},

	_removeTile: function (key) {
		var tile = this._tiles[key];

		this.fire('tileunload', {tile: tile, url: tile.src});

		if (this.options.reuseTiles) {
			L.DomUtil.removeClass(tile, 'leaflet-tile-loaded');
			this._unusedTiles.push(tile);

		} else if (tile.parentNode === this._tileContainer) {
			this._tileContainer.removeChild(tile);
		}

		// for https://github.com/CloudMade/Leaflet/issues/137
		if (!L.Browser.android) {
			tile.onload = null;
			tile.src = L.Util.emptyImageUrl;
		}

		delete this._tiles[key];
	},

	_addTile: function (tilePoint, container) {
		var tilePos = this._getTilePos(tilePoint);

		// get unused tile - or create a new tile
		var tile = this._getTile();

		/*
		Chrome 20 layouts much faster with top/left (verify with timeline, frames)
		Android 4 browser has display issues with top/left and requires transform instead
		(other browsers don't currently care) - see debug/hacks/jitter.html for an example
		*/
		L.DomUtil.setPosition(tile, tilePos, L.Browser.chrome);

		this._tiles[tilePoint.x + ':' + tilePoint.y] = tile;

		this._loadTile(tile, tilePoint);

		if (tile.parentNode !== this._tileContainer) {
			container.appendChild(tile);
		}
	},

	_getZoomForUrl: function () {

		var options = this.options,
		    zoom = this._map.getZoom();

		if (options.zoomReverse) {
			zoom = options.maxZoom - zoom;
		}

		zoom += options.zoomOffset;

		return options.maxNativeZoom ? Math.min(zoom, options.maxNativeZoom) : zoom;
	},

	_getTilePos: function (tilePoint) {
		var origin = this._map.getPixelOrigin(),
		    tileSize = this._getTileSize();

		return tilePoint.multiplyBy(tileSize).subtract(origin);
	},

	// image-specific code (override to implement e.g. Canvas or SVG tile layer)

	getTileUrl: function (tilePoint) {
		return L.Util.template(this._url, L.extend({
			s: this._getSubdomain(tilePoint),
			z: tilePoint.z,
			x: tilePoint.x,
			y: tilePoint.y
		}, this.options));
	},

	_getWrapTileNum: function () {
		var crs = this._map.options.crs,
		    size = crs.getSize(this._map.getZoom());
		return size.divideBy(this._getTileSize())._floor();
	},

	_adjustTilePoint: function (tilePoint) {

		var limit = this._getWrapTileNum();

		// wrap tile coordinates
		if (!this.options.continuousWorld && !this.options.noWrap) {
			tilePoint.x = ((tilePoint.x % limit.x) + limit.x) % limit.x;
		}

		if (this.options.tms) {
			tilePoint.y = limit.y - tilePoint.y - 1;
		}

		tilePoint.z = this._getZoomForUrl();
	},

	_getSubdomain: function (tilePoint) {
		var index = Math.abs(tilePoint.x + tilePoint.y) % this.options.subdomains.length;
		return this.options.subdomains[index];
	},

	_getTile: function () {
		if (this.options.reuseTiles && this._unusedTiles.length > 0) {
			var tile = this._unusedTiles.pop();
			this._resetTile(tile);
			return tile;
		}
		return this._createTile();
	},

	// Override if data stored on a tile needs to be cleaned up before reuse
	_resetTile: function (/*tile*/) {},

	_createTile: function () {
		var tile = L.DomUtil.create('img', 'leaflet-tile');
		tile.style.width = tile.style.height = this._getTileSize() + 'px';
		tile.galleryimg = 'no';

		tile.onselectstart = tile.onmousemove = L.Util.falseFn;

		if (L.Browser.ielt9 && this.options.opacity !== undefined) {
			L.DomUtil.setOpacity(tile, this.options.opacity);
		}
		// without this hack, tiles disappear after zoom on Chrome for Android
		// https://github.com/Leaflet/Leaflet/issues/2078
		if (L.Browser.mobileWebkit3d) {
			tile.style.WebkitBackfaceVisibility = 'hidden';
		}
		return tile;
	},

	_loadTile: function (tile, tilePoint) {
		tile._layer  = this;
		tile.onload  = this._tileOnLoad;
		tile.onerror = this._tileOnError;

		this._adjustTilePoint(tilePoint);
		tile.src     = this.getTileUrl(tilePoint);

		this.fire('tileloadstart', {
			tile: tile,
			url: tile.src
		});
	},

	_tileLoaded: function () {
		this._tilesToLoad--;

		if (this._animated) {
			L.DomUtil.addClass(this._tileContainer, 'leaflet-zoom-animated');
		}

		if (!this._tilesToLoad) {
			this.fire('load');

			if (this._animated) {
				// clear scaled tiles after all new tiles are loaded (for performance)
				clearTimeout(this._clearBgBufferTimer);
				this._clearBgBufferTimer = setTimeout(L.bind(this._clearBgBuffer, this), 500);
			}
		}
	},

	_tileOnLoad: function () {
		var layer = this._layer;

		//Only if we are loading an actual image
		if (this.src !== L.Util.emptyImageUrl) {
			L.DomUtil.addClass(this, 'leaflet-tile-loaded');

			layer.fire('tileload', {
				tile: this,
				url: this.src
			});
		}

		layer._tileLoaded();
	},

	_tileOnError: function () {
		var layer = this._layer;

		layer.fire('tileerror', {
			tile: this,
			url: this.src
		});

		var newUrl = layer.options.errorTileUrl;
		if (newUrl) {
			this.src = newUrl;
		}

		layer._tileLoaded();
	}
});

L.tileLayer = function (url, options) {
	return new L.TileLayer(url, options);
};


/*
 * L.TileLayer.WMS is used for putting WMS tile layers on the map.
 */

L.TileLayer.WMS = L.TileLayer.extend({

	defaultWmsParams: {
		service: 'WMS',
		request: 'GetMap',
		version: '1.1.1',
		layers: '',
		styles: '',
		format: 'image/jpeg',
		transparent: false
	},

	initialize: function (url, options) { // (String, Object)

		this._url = url;

		var wmsParams = L.extend({}, this.defaultWmsParams),
		    tileSize = options.tileSize || this.options.tileSize;

		if (options.detectRetina && L.Browser.retina) {
			wmsParams.width = wmsParams.height = tileSize * 2;
		} else {
			wmsParams.width = wmsParams.height = tileSize;
		}

		for (var i in options) {
			// all keys that are not TileLayer options go to WMS params
			if (!this.options.hasOwnProperty(i) && i !== 'crs') {
				wmsParams[i] = options[i];
			}
		}

		this.wmsParams = wmsParams;

		L.setOptions(this, options);
	},

	onAdd: function (map) {

		this._crs = this.options.crs || map.options.crs;

		this._wmsVersion = parseFloat(this.wmsParams.version);

		var projectionKey = this._wmsVersion >= 1.3 ? 'crs' : 'srs';
		this.wmsParams[projectionKey] = this._crs.code;

		L.TileLayer.prototype.onAdd.call(this, map);
	},

	getTileUrl: function (tilePoint) { // (Point, Number) -> String

		var map = this._map,
		    tileSize = this.options.tileSize,

		    nwPoint = tilePoint.multiplyBy(tileSize),
		    sePoint = nwPoint.add([tileSize, tileSize]),

		    nw = this._crs.project(map.unproject(nwPoint, tilePoint.z)),
		    se = this._crs.project(map.unproject(sePoint, tilePoint.z)),
		    bbox = this._wmsVersion >= 1.3 && this._crs === L.CRS.EPSG4326 ?
		        [se.y, nw.x, nw.y, se.x].join(',') :
		        [nw.x, se.y, se.x, nw.y].join(','),

		    url = L.Util.template(this._url, {s: this._getSubdomain(tilePoint)});

		return url + L.Util.getParamString(this.wmsParams, url, true) + '&BBOX=' + bbox;
	},

	setParams: function (params, noRedraw) {

		L.extend(this.wmsParams, params);

		if (!noRedraw) {
			this.redraw();
		}

		return this;
	}
});

L.tileLayer.wms = function (url, options) {
	return new L.TileLayer.WMS(url, options);
};


/*
 * L.TileLayer.Canvas is a class that you can use as a base for creating
 * dynamically drawn Canvas-based tile layers.
 */

L.TileLayer.Canvas = L.TileLayer.extend({
	options: {
		async: false
	},

	initialize: function (options) {
		L.setOptions(this, options);
	},

	redraw: function () {
		if (this._map) {
			this._reset({hard: true});
			this._update();
		}

		for (var i in this._tiles) {
			this._redrawTile(this._tiles[i]);
		}
		return this;
	},

	_redrawTile: function (tile) {
		this.drawTile(tile, tile._tilePoint, this._map._zoom);
	},

	_createTile: function () {
		var tile = L.DomUtil.create('canvas', 'leaflet-tile');
		tile.width = tile.height = this.options.tileSize;
		tile.onselectstart = tile.onmousemove = L.Util.falseFn;
		return tile;
	},

	_loadTile: function (tile, tilePoint) {
		tile._layer = this;
		tile._tilePoint = tilePoint;

		this._redrawTile(tile);

		if (!this.options.async) {
			this.tileDrawn(tile);
		}
	},

	drawTile: function (/*tile, tilePoint*/) {
		// override with rendering code
	},

	tileDrawn: function (tile) {
		this._tileOnLoad.call(tile);
	}
});


L.tileLayer.canvas = function (options) {
	return new L.TileLayer.Canvas(options);
};


/*
 * L.ImageOverlay is used to overlay images over the map (to specific geographical bounds).
 */

L.ImageOverlay = L.Class.extend({
	includes: L.Mixin.Events,

	options: {
		opacity: 1
	},

	initialize: function (url, bounds, options) { // (String, LatLngBounds, Object)
		this._url = url;
		this._bounds = L.latLngBounds(bounds);

		L.setOptions(this, options);
	},

	onAdd: function (map) {
		this._map = map;

		if (!this._image) {
			this._initImage();
		}

		map._panes.overlayPane.appendChild(this._image);

		map.on('viewreset', this._reset, this);

		if (map.options.zoomAnimation && L.Browser.any3d) {
			map.on('zoomanim', this._animateZoom, this);
		}

		this._reset();
	},

	onRemove: function (map) {
		map.getPanes().overlayPane.removeChild(this._image);

		map.off('viewreset', this._reset, this);

		if (map.options.zoomAnimation) {
			map.off('zoomanim', this._animateZoom, this);
		}
	},

	addTo: function (map) {
		map.addLayer(this);
		return this;
	},

	setOpacity: function (opacity) {
		this.options.opacity = opacity;
		this._updateOpacity();
		return this;
	},

	// TODO remove bringToFront/bringToBack duplication from TileLayer/Path
	bringToFront: function () {
		if (this._image) {
			this._map._panes.overlayPane.appendChild(this._image);
		}
		return this;
	},

	bringToBack: function () {
		var pane = this._map._panes.overlayPane;
		if (this._image) {
			pane.insertBefore(this._image, pane.firstChild);
		}
		return this;
	},

	setUrl: function (url) {
		this._url = url;
		this._image.src = this._url;
	},

	getAttribution: function () {
		return this.options.attribution;
	},

	_initImage: function () {
		this._image = L.DomUtil.create('img', 'leaflet-image-layer');

		if (this._map.options.zoomAnimation && L.Browser.any3d) {
			L.DomUtil.addClass(this._image, 'leaflet-zoom-animated');
		} else {
			L.DomUtil.addClass(this._image, 'leaflet-zoom-hide');
		}

		this._updateOpacity();

		//TODO createImage util method to remove duplication
		L.extend(this._image, {
			galleryimg: 'no',
			onselectstart: L.Util.falseFn,
			onmousemove: L.Util.falseFn,
			onload: L.bind(this._onImageLoad, this),
			src: this._url
		});
	},

	_animateZoom: function (e) {
		var map = this._map,
		    image = this._image,
		    scale = map.getZoomScale(e.zoom),
		    nw = this._bounds.getNorthWest(),
		    se = this._bounds.getSouthEast(),

		    topLeft = map._latLngToNewLayerPoint(nw, e.zoom, e.center),
		    size = map._latLngToNewLayerPoint(se, e.zoom, e.center)._subtract(topLeft),
		    origin = topLeft._add(size._multiplyBy((1 / 2) * (1 - 1 / scale)));

		image.style[L.DomUtil.TRANSFORM] =
		        L.DomUtil.getTranslateString(origin) + ' scale(' + scale + ') ';
	},

	_reset: function () {
		var image   = this._image,
		    topLeft = this._map.latLngToLayerPoint(this._bounds.getNorthWest()),
		    size = this._map.latLngToLayerPoint(this._bounds.getSouthEast())._subtract(topLeft);

		L.DomUtil.setPosition(image, topLeft);

		image.style.width  = size.x + 'px';
		image.style.height = size.y + 'px';
	},

	_onImageLoad: function () {
		this.fire('load');
	},

	_updateOpacity: function () {
		L.DomUtil.setOpacity(this._image, this.options.opacity);
	}
});

L.imageOverlay = function (url, bounds, options) {
	return new L.ImageOverlay(url, bounds, options);
};


/*
 * L.Icon is an image-based icon class that you can use with L.Marker for custom markers.
 */

L.Icon = L.Class.extend({
	options: {
		/*
		iconUrl: (String) (required)
		iconRetinaUrl: (String) (optional, used for retina devices if detected)
		iconSize: (Point) (can be set through CSS)
		iconAnchor: (Point) (centered by default, can be set in CSS with negative margins)
		popupAnchor: (Point) (if not specified, popup opens in the anchor point)
		shadowUrl: (String) (no shadow by default)
		shadowRetinaUrl: (String) (optional, used for retina devices if detected)
		shadowSize: (Point)
		shadowAnchor: (Point)
		*/
		className: ''
	},

	initialize: function (options) {
		L.setOptions(this, options);
	},

	createIcon: function (oldIcon) {
		return this._createIcon('icon', oldIcon);
	},

	createShadow: function (oldIcon) {
		return this._createIcon('shadow', oldIcon);
	},

	_createIcon: function (name, oldIcon) {
		var src = this._getIconUrl(name);

		if (!src) {
			if (name === 'icon') {
				throw new Error('iconUrl not set in Icon options (see the docs).');
			}
			return null;
		}

		var img;
		if (!oldIcon || oldIcon.tagName !== 'IMG') {
			img = this._createImg(src);
		} else {
			img = this._createImg(src, oldIcon);
		}
		this._setIconStyles(img, name);

		return img;
	},

	_setIconStyles: function (img, name) {
		var options = this.options,
		    size = L.point(options[name + 'Size']),
		    anchor;

		if (name === 'shadow') {
			anchor = L.point(options.shadowAnchor || options.iconAnchor);
		} else {
			anchor = L.point(options.iconAnchor);
		}

		if (!anchor && size) {
			anchor = size.divideBy(2, true);
		}

		img.className = 'leaflet-marker-' + name + ' ' + options.className;

		if (anchor) {
			img.style.marginLeft = (-anchor.x) + 'px';
			img.style.marginTop  = (-anchor.y) + 'px';
		}

		if (size) {
			img.style.width  = size.x + 'px';
			img.style.height = size.y + 'px';
		}
	},

	_createImg: function (src, el) {
		el = el || document.createElement('img');
		el.src = src;
		return el;
	},

	_getIconUrl: function (name) {
		if (L.Browser.retina && this.options[name + 'RetinaUrl']) {
			return this.options[name + 'RetinaUrl'];
		}
		return this.options[name + 'Url'];
	}
});

L.icon = function (options) {
	return new L.Icon(options);
};


/*
 * L.Icon.Default is the blue marker icon used by default in Leaflet.
 */

L.Icon.Default = L.Icon.extend({

	options: {
		iconSize: [25, 41],
		iconAnchor: [12, 41],
		popupAnchor: [1, -34],

		shadowSize: [41, 41]
	},

	_getIconUrl: function (name) {
		var key = name + 'Url';

		if (this.options[key]) {
			return this.options[key];
		}

		if (L.Browser.retina && name === 'icon') {
			name += '-2x';
		}

		var path = L.Icon.Default.imagePath;

		if (!path) {
			throw new Error('Couldn\'t autodetect L.Icon.Default.imagePath, set it manually.');
		}

		return path + '/marker-' + name + '.png';
	}
});

L.Icon.Default.imagePath = (function () {
	var scripts = document.getElementsByTagName('script'),
	    leafletRe = /[\/^]leaflet[\-\._]?([\w\-\._]*)\.js\??/;

	var i, len, src, matches, path;

	for (i = 0, len = scripts.length; i < len; i++) {
		src = scripts[i].src;
		matches = src.match(leafletRe);

		if (matches) {
			path = src.split(leafletRe)[0];
			return (path ? path + '/' : '') + 'images';
		}
	}
}());


/*
 * L.Marker is used to display clickable/draggable icons on the map.
 */

L.Marker = L.Class.extend({

	includes: L.Mixin.Events,

	options: {
		icon: new L.Icon.Default(),
		title: '',
		alt: '',
		clickable: true,
		draggable: false,
		keyboard: true,
		zIndexOffset: 0,
		opacity: 1,
		riseOnHover: false,
		riseOffset: 250
	},

	initialize: function (latlng, options) {
		L.setOptions(this, options);
		this._latlng = L.latLng(latlng);
	},

	onAdd: function (map) {
		this._map = map;

		map.on('viewreset', this.update, this);

		this._initIcon();
		this.update();
		this.fire('add');

		if (map.options.zoomAnimation && map.options.markerZoomAnimation) {
			map.on('zoomanim', this._animateZoom, this);
		}
	},

	addTo: function (map) {
		map.addLayer(this);
		return this;
	},

	onRemove: function (map) {
		if (this.dragging) {
			this.dragging.disable();
		}

		this._removeIcon();
		this._removeShadow();

		this.fire('remove');

		map.off({
			'viewreset': this.update,
			'zoomanim': this._animateZoom
		}, this);

		this._map = null;
	},

	getLatLng: function () {
		return this._latlng;
	},

	setLatLng: function (latlng) {
		this._latlng = L.latLng(latlng);

		this.update();

		return this.fire('move', { latlng: this._latlng });
	},

	setZIndexOffset: function (offset) {
		this.options.zIndexOffset = offset;
		this.update();

		return this;
	},

	setIcon: function (icon) {

		this.options.icon = icon;

		if (this._map) {
			this._initIcon();
			this.update();
		}

		if (this._popup) {
			this.bindPopup(this._popup);
		}

		return this;
	},

	update: function () {
		if (this._icon) {
			var pos = this._map.latLngToLayerPoint(this._latlng).round();
			this._setPos(pos);
		}

		return this;
	},

	_initIcon: function () {
		var options = this.options,
		    map = this._map,
		    animation = (map.options.zoomAnimation && map.options.markerZoomAnimation),
		    classToAdd = animation ? 'leaflet-zoom-animated' : 'leaflet-zoom-hide';

		var icon = options.icon.createIcon(this._icon),
			addIcon = false;

		// if we're not reusing the icon, remove the old one and init new one
		if (icon !== this._icon) {
			if (this._icon) {
				this._removeIcon();
			}
			addIcon = true;

			if (options.title) {
				icon.title = options.title;
			}
			
			if (options.alt) {
				icon.alt = options.alt;
			}
		}

		L.DomUtil.addClass(icon, classToAdd);

		if (options.keyboard) {
			icon.tabIndex = '0';
		}

		this._icon = icon;

		this._initInteraction();

		if (options.riseOnHover) {
			L.DomEvent
				.on(icon, 'mouseover', this._bringToFront, this)
				.on(icon, 'mouseout', this._resetZIndex, this);
		}

		var newShadow = options.icon.createShadow(this._shadow),
			addShadow = false;

		if (newShadow !== this._shadow) {
			this._removeShadow();
			addShadow = true;
		}

		if (newShadow) {
			L.DomUtil.addClass(newShadow, classToAdd);
		}
		this._shadow = newShadow;


		if (options.opacity < 1) {
			this._updateOpacity();
		}


		var panes = this._map._panes;

		if (addIcon) {
			panes.markerPane.appendChild(this._icon);
		}

		if (newShadow && addShadow) {
			panes.shadowPane.appendChild(this._shadow);
		}
	},

	_removeIcon: function () {
		if (this.options.riseOnHover) {
			L.DomEvent
			    .off(this._icon, 'mouseover', this._bringToFront)
			    .off(this._icon, 'mouseout', this._resetZIndex);
		}

		this._map._panes.markerPane.removeChild(this._icon);

		this._icon = null;
	},

	_removeShadow: function () {
		if (this._shadow) {
			this._map._panes.shadowPane.removeChild(this._shadow);
		}
		this._shadow = null;
	},

	_setPos: function (pos) {
		L.DomUtil.setPosition(this._icon, pos);

		if (this._shadow) {
			L.DomUtil.setPosition(this._shadow, pos);
		}

		this._zIndex = pos.y + this.options.zIndexOffset;

		this._resetZIndex();
	},

	_updateZIndex: function (offset) {
		this._icon.style.zIndex = this._zIndex + offset;
	},

	_animateZoom: function (opt) {
		var pos = this._map._latLngToNewLayerPoint(this._latlng, opt.zoom, opt.center).round();

		this._setPos(pos);
	},

	_initInteraction: function () {

		if (!this.options.clickable) { return; }

		// TODO refactor into something shared with Map/Path/etc. to DRY it up

		var icon = this._icon,
		    events = ['dblclick', 'mousedown', 'mouseover', 'mouseout', 'contextmenu'];

		L.DomUtil.addClass(icon, 'leaflet-clickable');
		L.DomEvent.on(icon, 'click', this._onMouseClick, this);
		L.DomEvent.on(icon, 'keypress', this._onKeyPress, this);

		for (var i = 0; i < events.length; i++) {
			L.DomEvent.on(icon, events[i], this._fireMouseEvent, this);
		}

		if (L.Handler.MarkerDrag) {
			this.dragging = new L.Handler.MarkerDrag(this);

			if (this.options.draggable) {
				this.dragging.enable();
			}
		}
	},

	_onMouseClick: function (e) {
		var wasDragged = this.dragging && this.dragging.moved();

		if (this.hasEventListeners(e.type) || wasDragged) {
			L.DomEvent.stopPropagation(e);
		}

		if (wasDragged) { return; }

		if ((!this.dragging || !this.dragging._enabled) && this._map.dragging && this._map.dragging.moved()) { return; }

		this.fire(e.type, {
			originalEvent: e,
			latlng: this._latlng
		});
	},

	_onKeyPress: function (e) {
		if (e.keyCode === 13) {
			this.fire('click', {
				originalEvent: e,
				latlng: this._latlng
			});
		}
	},

	_fireMouseEvent: function (e) {

		this.fire(e.type, {
			originalEvent: e,
			latlng: this._latlng
		});

		// TODO proper custom event propagation
		// this line will always be called if marker is in a FeatureGroup
		if (e.type === 'contextmenu' && this.hasEventListeners(e.type)) {
			L.DomEvent.preventDefault(e);
		}
		if (e.type !== 'mousedown') {
			L.DomEvent.stopPropagation(e);
		} else {
			L.DomEvent.preventDefault(e);
		}
	},

	setOpacity: function (opacity) {
		this.options.opacity = opacity;
		if (this._map) {
			this._updateOpacity();
		}

		return this;
	},

	_updateOpacity: function () {
		L.DomUtil.setOpacity(this._icon, this.options.opacity);
		if (this._shadow) {
			L.DomUtil.setOpacity(this._shadow, this.options.opacity);
		}
	},

	_bringToFront: function () {
		this._updateZIndex(this.options.riseOffset);
	},

	_resetZIndex: function () {
		this._updateZIndex(0);
	}
});

L.marker = function (latlng, options) {
	return new L.Marker(latlng, options);
};


/*
 * L.DivIcon is a lightweight HTML-based icon class (as opposed to the image-based L.Icon)
 * to use with L.Marker.
 */

L.DivIcon = L.Icon.extend({
	options: {
		iconSize: [12, 12], // also can be set through CSS
		/*
		iconAnchor: (Point)
		popupAnchor: (Point)
		html: (String)
		bgPos: (Point)
		*/
		className: 'leaflet-div-icon',
		html: false
	},

	createIcon: function (oldIcon) {
		var div = (oldIcon && oldIcon.tagName === 'DIV') ? oldIcon : document.createElement('div'),
		    options = this.options;

		if (options.html !== false) {
			div.innerHTML = options.html;
		} else {
			div.innerHTML = '';
		}

		if (options.bgPos) {
			div.style.backgroundPosition =
			        (-options.bgPos.x) + 'px ' + (-options.bgPos.y) + 'px';
		}

		this._setIconStyles(div, 'icon');
		return div;
	},

	createShadow: function () {
		return null;
	}
});

L.divIcon = function (options) {
	return new L.DivIcon(options);
};


/*
 * L.Popup is used for displaying popups on the map.
 */

L.Map.mergeOptions({
	closePopupOnClick: true
});

L.Popup = L.Class.extend({
	includes: L.Mixin.Events,

	options: {
		minWidth: 50,
		maxWidth: 300,
		// maxHeight: null,
		autoPan: true,
		closeButton: true,
		offset: [0, 7],
		autoPanPadding: [5, 5],
		// autoPanPaddingTopLeft: null,
		// autoPanPaddingBottomRight: null,
		keepInView: false,
		className: '',
		zoomAnimation: true
	},

	initialize: function (options, source) {
		L.setOptions(this, options);

		this._source = source;
		this._animated = L.Browser.any3d && this.options.zoomAnimation;
		this._isOpen = false;
	},

	onAdd: function (map) {
		this._map = map;

		if (!this._container) {
			this._initLayout();
		}

		var animFade = map.options.fadeAnimation;

		if (animFade) {
			L.DomUtil.setOpacity(this._container, 0);
		}
		map._panes.popupPane.appendChild(this._container);

		map.on(this._getEvents(), this);

		this.update();

		if (animFade) {
			L.DomUtil.setOpacity(this._container, 1);
		}

		this.fire('open');

		map.fire('popupopen', {popup: this});

		if (this._source) {
			this._source.fire('popupopen', {popup: this});
		}
	},

	addTo: function (map) {
		map.addLayer(this);
		return this;
	},

	openOn: function (map) {
		map.openPopup(this);
		return this;
	},

	onRemove: function (map) {
		map._panes.popupPane.removeChild(this._container);

		L.Util.falseFn(this._container.offsetWidth); // force reflow

		map.off(this._getEvents(), this);

		if (map.options.fadeAnimation) {
			L.DomUtil.setOpacity(this._container, 0);
		}

		this._map = null;

		this.fire('close');

		map.fire('popupclose', {popup: this});

		if (this._source) {
			this._source.fire('popupclose', {popup: this});
		}
	},

	getLatLng: function () {
		return this._latlng;
	},

	setLatLng: function (latlng) {
		this._latlng = L.latLng(latlng);
		if (this._map) {
			this._updatePosition();
			this._adjustPan();
		}
		return this;
	},

	getContent: function () {
		return this._content;
	},

	setContent: function (content) {
		this._content = content;
		this.update();
		return this;
	},

	update: function () {
		if (!this._map) { return; }

		this._container.style.visibility = 'hidden';

		this._updateContent();
		this._updateLayout();
		this._updatePosition();

		this._container.style.visibility = '';

		this._adjustPan();
	},

	_getEvents: function () {
		var events = {
			viewreset: this._updatePosition
		};

		if (this._animated) {
			events.zoomanim = this._zoomAnimation;
		}
		if ('closeOnClick' in this.options ? this.options.closeOnClick : this._map.options.closePopupOnClick) {
			events.preclick = this._close;
		}
		if (this.options.keepInView) {
			events.moveend = this._adjustPan;
		}

		return events;
	},

	_close: function () {
		if (this._map) {
			this._map.closePopup(this);
		}
	},

	_initLayout: function () {
		var prefix = 'leaflet-popup',
			containerClass = prefix + ' ' + this.options.className + ' leaflet-zoom-' +
			        (this._animated ? 'animated' : 'hide'),
			container = this._container = L.DomUtil.create('div', containerClass),
			closeButton;

		if (this.options.closeButton) {
			closeButton = this._closeButton =
			        L.DomUtil.create('a', prefix + '-close-button', container);
			closeButton.href = '#close';
			closeButton.innerHTML = '&#215;';
			L.DomEvent.disableClickPropagation(closeButton);

			L.DomEvent.on(closeButton, 'click', this._onCloseButtonClick, this);
		}

		var wrapper = this._wrapper =
		        L.DomUtil.create('div', prefix + '-content-wrapper', container);
		L.DomEvent.disableClickPropagation(wrapper);

		this._contentNode = L.DomUtil.create('div', prefix + '-content', wrapper);

		L.DomEvent.disableScrollPropagation(this._contentNode);
		L.DomEvent.on(wrapper, 'contextmenu', L.DomEvent.stopPropagation);

		this._tipContainer = L.DomUtil.create('div', prefix + '-tip-container', container);
		this._tip = L.DomUtil.create('div', prefix + '-tip', this._tipContainer);
	},

	_updateContent: function () {
		if (!this._content) { return; }

		if (typeof this._content === 'string') {
			this._contentNode.innerHTML = this._content;
		} else {
			while (this._contentNode.hasChildNodes()) {
				this._contentNode.removeChild(this._contentNode.firstChild);
			}
			this._contentNode.appendChild(this._content);
		}
		this.fire('contentupdate');
	},

	_updateLayout: function () {
		var container = this._contentNode,
		    style = container.style;

		style.width = '';
		style.whiteSpace = 'nowrap';

		var width = container.offsetWidth;
		width = Math.min(width, this.options.maxWidth);
		width = Math.max(width, this.options.minWidth);

		style.width = (width + 1) + 'px';
		style.whiteSpace = '';

		style.height = '';

		var height = container.offsetHeight,
		    maxHeight = this.options.maxHeight,
		    scrolledClass = 'leaflet-popup-scrolled';

		if (maxHeight && height > maxHeight) {
			style.height = maxHeight + 'px';
			L.DomUtil.addClass(container, scrolledClass);
		} else {
			L.DomUtil.removeClass(container, scrolledClass);
		}

		this._containerWidth = this._container.offsetWidth;
	},

	_updatePosition: function () {
		if (!this._map) { return; }

		var pos = this._map.latLngToLayerPoint(this._latlng),
		    animated = this._animated,
		    offset = L.point(this.options.offset);

		if (animated) {
			L.DomUtil.setPosition(this._container, pos);
		}

		this._containerBottom = -offset.y - (animated ? 0 : pos.y);
		this._containerLeft = -Math.round(this._containerWidth / 2) + offset.x + (animated ? 0 : pos.x);

		// bottom position the popup in case the height of the popup changes (images loading etc)
		this._container.style.bottom = this._containerBottom + 'px';
		this._container.style.left = this._containerLeft + 'px';
	},

	_zoomAnimation: function (opt) {
		var pos = this._map._latLngToNewLayerPoint(this._latlng, opt.zoom, opt.center);

		L.DomUtil.setPosition(this._container, pos);
	},

	_adjustPan: function () {
		if (!this.options.autoPan) { return; }

		var map = this._map,
		    containerHeight = this._container.offsetHeight,
		    containerWidth = this._containerWidth,

		    layerPos = new L.Point(this._containerLeft, -containerHeight - this._containerBottom);

		if (this._animated) {
			layerPos._add(L.DomUtil.getPosition(this._container));
		}

		var containerPos = map.layerPointToContainerPoint(layerPos),
		    padding = L.point(this.options.autoPanPadding),
		    paddingTL = L.point(this.options.autoPanPaddingTopLeft || padding),
		    paddingBR = L.point(this.options.autoPanPaddingBottomRight || padding),
		    size = map.getSize(),
		    dx = 0,
		    dy = 0;

		if (containerPos.x + containerWidth + paddingBR.x > size.x) { // right
			dx = containerPos.x + containerWidth - size.x + paddingBR.x;
		}
		if (containerPos.x - dx - paddingTL.x < 0) { // left
			dx = containerPos.x - paddingTL.x;
		}
		if (containerPos.y + containerHeight + paddingBR.y > size.y) { // bottom
			dy = containerPos.y + containerHeight - size.y + paddingBR.y;
		}
		if (containerPos.y - dy - paddingTL.y < 0) { // top
			dy = containerPos.y - paddingTL.y;
		}

		if (dx || dy) {
			map
			    .fire('autopanstart')
			    .panBy([dx, dy]);
		}
	},

	_onCloseButtonClick: function (e) {
		this._close();
		L.DomEvent.stop(e);
	}
});

L.popup = function (options, source) {
	return new L.Popup(options, source);
};


L.Map.include({
	openPopup: function (popup, latlng, options) { // (Popup) or (String || HTMLElement, LatLng[, Object])
		this.closePopup();

		if (!(popup instanceof L.Popup)) {
			var content = popup;

			popup = new L.Popup(options)
			    .setLatLng(latlng)
			    .setContent(content);
		}
		popup._isOpen = true;

		this._popup = popup;
		return this.addLayer(popup);
	},

	closePopup: function (popup) {
		if (!popup || popup === this._popup) {
			popup = this._popup;
			this._popup = null;
		}
		if (popup) {
			this.removeLayer(popup);
			popup._isOpen = false;
		}
		return this;
	}
});


/*
 * Popup extension to L.Marker, adding popup-related methods.
 */

L.Marker.include({
	openPopup: function () {
		if (this._popup && this._map && !this._map.hasLayer(this._popup)) {
			this._popup.setLatLng(this._latlng);
			this._map.openPopup(this._popup);
		}

		return this;
	},

	closePopup: function () {
		if (this._popup) {
			this._popup._close();
		}
		return this;
	},

	togglePopup: function () {
		if (this._popup) {
			if (this._popup._isOpen) {
				this.closePopup();
			} else {
				this.openPopup();
			}
		}
		return this;
	},

	bindPopup: function (content, options) {
		var anchor = L.point(this.options.icon.options.popupAnchor || [0, 0]);

		anchor = anchor.add(L.Popup.prototype.options.offset);

		if (options && options.offset) {
			anchor = anchor.add(options.offset);
		}

		options = L.extend({offset: anchor}, options);

		if (!this._popupHandlersAdded) {
			this
			    .on('click', this.togglePopup, this)
			    .on('remove', this.closePopup, this)
			    .on('move', this._movePopup, this);
			this._popupHandlersAdded = true;
		}

		if (content instanceof L.Popup) {
			L.setOptions(content, options);
			this._popup = content;
		} else {
			this._popup = new L.Popup(options, this)
				.setContent(content);
		}

		return this;
	},

	setPopupContent: function (content) {
		if (this._popup) {
			this._popup.setContent(content);
		}
		return this;
	},

	unbindPopup: function () {
		if (this._popup) {
			this._popup = null;
			this
			    .off('click', this.togglePopup, this)
			    .off('remove', this.closePopup, this)
			    .off('move', this._movePopup, this);
			this._popupHandlersAdded = false;
		}
		return this;
	},

	getPopup: function () {
		return this._popup;
	},

	_movePopup: function (e) {
		this._popup.setLatLng(e.latlng);
	}
});


/*
 * L.LayerGroup is a class to combine several layers into one so that
 * you can manipulate the group (e.g. add/remove it) as one layer.
 */

L.LayerGroup = L.Class.extend({
	initialize: function (layers) {
		this._layers = {};

		var i, len;

		if (layers) {
			for (i = 0, len = layers.length; i < len; i++) {
				this.addLayer(layers[i]);
			}
		}
	},

	addLayer: function (layer) {
		var id = this.getLayerId(layer);

		this._layers[id] = layer;

		if (this._map) {
			this._map.addLayer(layer);
		}

		return this;
	},

	removeLayer: function (layer) {
		var id = layer in this._layers ? layer : this.getLayerId(layer);

		if (this._map && this._layers[id]) {
			this._map.removeLayer(this._layers[id]);
		}

		delete this._layers[id];

		return this;
	},

	hasLayer: function (layer) {
		if (!layer) { return false; }

		return (layer in this._layers || this.getLayerId(layer) in this._layers);
	},

	clearLayers: function () {
		this.eachLayer(this.removeLayer, this);
		return this;
	},

	invoke: function (methodName) {
		var args = Array.prototype.slice.call(arguments, 1),
		    i, layer;

		for (i in this._layers) {
			layer = this._layers[i];

			if (layer[methodName]) {
				layer[methodName].apply(layer, args);
			}
		}

		return this;
	},

	onAdd: function (map) {
		this._map = map;
		this.eachLayer(map.addLayer, map);
	},

	onRemove: function (map) {
		this.eachLayer(map.removeLayer, map);
		this._map = null;
	},

	addTo: function (map) {
		map.addLayer(this);
		return this;
	},

	eachLayer: function (method, context) {
		for (var i in this._layers) {
			method.call(context, this._layers[i]);
		}
		return this;
	},

	getLayer: function (id) {
		return this._layers[id];
	},

	getLayers: function () {
		var layers = [];

		for (var i in this._layers) {
			layers.push(this._layers[i]);
		}
		return layers;
	},

	setZIndex: function (zIndex) {
		return this.invoke('setZIndex', zIndex);
	},

	getLayerId: function (layer) {
		return L.stamp(layer);
	}
});

L.layerGroup = function (layers) {
	return new L.LayerGroup(layers);
};


/*
 * L.FeatureGroup extends L.LayerGroup by introducing mouse events and additional methods
 * shared between a group of interactive layers (like vectors or markers).
 */

L.FeatureGroup = L.LayerGroup.extend({
	includes: L.Mixin.Events,

	statics: {
		EVENTS: 'click dblclick mouseover mouseout mousemove contextmenu popupopen popupclose'
	},

	addLayer: function (layer) {
		if (this.hasLayer(layer)) {
			return this;
		}

		if ('on' in layer) {
			layer.on(L.FeatureGroup.EVENTS, this._propagateEvent, this);
		}

		L.LayerGroup.prototype.addLayer.call(this, layer);

		if (this._popupContent && layer.bindPopup) {
			layer.bindPopup(this._popupContent, this._popupOptions);
		}

		return this.fire('layeradd', {layer: layer});
	},

	removeLayer: function (layer) {
		if (!this.hasLayer(layer)) {
			return this;
		}
		if (layer in this._layers) {
			layer = this._layers[layer];
		}

		layer.off(L.FeatureGroup.EVENTS, this._propagateEvent, this);

		L.LayerGroup.prototype.removeLayer.call(this, layer);

		if (this._popupContent) {
			this.invoke('unbindPopup');
		}

		return this.fire('layerremove', {layer: layer});
	},

	bindPopup: function (content, options) {
		this._popupContent = content;
		this._popupOptions = options;
		return this.invoke('bindPopup', content, options);
	},

	openPopup: function (latlng) {
		// open popup on the first layer
		for (var id in this._layers) {
			this._layers[id].openPopup(latlng);
			break;
		}
		return this;
	},

	setStyle: function (style) {
		return this.invoke('setStyle', style);
	},

	bringToFront: function () {
		return this.invoke('bringToFront');
	},

	bringToBack: function () {
		return this.invoke('bringToBack');
	},

	getBounds: function () {
		var bounds = new L.LatLngBounds();

		this.eachLayer(function (layer) {
			bounds.extend(layer instanceof L.Marker ? layer.getLatLng() : layer.getBounds());
		});

		return bounds;
	},

	_propagateEvent: function (e) {
		e = L.extend({
			layer: e.target,
			target: this
		}, e);
		this.fire(e.type, e);
	}
});

L.featureGroup = function (layers) {
	return new L.FeatureGroup(layers);
};


/*
 * L.Path is a base class for rendering vector paths on a map. Inherited by Polyline, Circle, etc.
 */

L.Path = L.Class.extend({
	includes: [L.Mixin.Events],

	statics: {
		// how much to extend the clip area around the map view
		// (relative to its size, e.g. 0.5 is half the screen in each direction)
		// set it so that SVG element doesn't exceed 1280px (vectors flicker on dragend if it is)
		CLIP_PADDING: (function () {
			var max = L.Browser.mobile ? 1280 : 2000,
			    target = (max / Math.max(window.outerWidth, window.outerHeight) - 1) / 2;
			return Math.max(0, Math.min(0.5, target));
		})()
	},

	options: {
		stroke: true,
		color: '#0033ff',
		dashArray: null,
		lineCap: null,
		lineJoin: null,
		weight: 5,
		opacity: 0.5,

		fill: false,
		fillColor: null, //same as color by default
		fillOpacity: 0.2,

		clickable: true
	},

	initialize: function (options) {
		L.setOptions(this, options);
	},

	onAdd: function (map) {
		this._map = map;

		if (!this._container) {
			this._initElements();
			this._initEvents();
		}

		this.projectLatlngs();
		this._updatePath();

		if (this._container) {
			this._map._pathRoot.appendChild(this._container);
		}

		this.fire('add');

		map.on({
			'viewreset': this.projectLatlngs,
			'moveend': this._updatePath
		}, this);
	},

	addTo: function (map) {
		map.addLayer(this);
		return this;
	},

	onRemove: function (map) {
		map._pathRoot.removeChild(this._container);

		// Need to fire remove event before we set _map to null as the event hooks might need the object
		this.fire('remove');
		this._map = null;

		if (L.Browser.vml) {
			this._container = null;
			this._stroke = null;
			this._fill = null;
		}

		map.off({
			'viewreset': this.projectLatlngs,
			'moveend': this._updatePath
		}, this);
	},

	projectLatlngs: function () {
		// do all projection stuff here
	},

	setStyle: function (style) {
		L.setOptions(this, style);

		if (this._container) {
			this._updateStyle();
		}

		return this;
	},

	redraw: function () {
		if (this._map) {
			this.projectLatlngs();
			this._updatePath();
		}
		return this;
	}
});

L.Map.include({
	_updatePathViewport: function () {
		var p = L.Path.CLIP_PADDING,
		    size = this.getSize(),
		    panePos = L.DomUtil.getPosition(this._mapPane),
		    min = panePos.multiplyBy(-1)._subtract(size.multiplyBy(p)._round()),
		    max = min.add(size.multiplyBy(1 + p * 2)._round());

		this._pathViewport = new L.Bounds(min, max);
	}
});


/*
 * Extends L.Path with SVG-specific rendering code.
 */

L.Path.SVG_NS = 'http://www.w3.org/2000/svg';

L.Browser.svg = !!(document.createElementNS && document.createElementNS(L.Path.SVG_NS, 'svg').createSVGRect);

L.Path = L.Path.extend({
	statics: {
		SVG: L.Browser.svg
	},

	bringToFront: function () {
		var root = this._map._pathRoot,
		    path = this._container;

		if (path && root.lastChild !== path) {
			root.appendChild(path);
		}
		return this;
	},

	bringToBack: function () {
		var root = this._map._pathRoot,
		    path = this._container,
		    first = root.firstChild;

		if (path && first !== path) {
			root.insertBefore(path, first);
		}
		return this;
	},

	getPathString: function () {
		// form path string here
	},

	_createElement: function (name) {
		return document.createElementNS(L.Path.SVG_NS, name);
	},

	_initElements: function () {
		this._map._initPathRoot();
		this._initPath();
		this._initStyle();
	},

	_initPath: function () {
		this._container = this._createElement('g');

		this._path = this._createElement('path');

		if (this.options.className) {
			L.DomUtil.addClass(this._path, this.options.className);
		}

		this._container.appendChild(this._path);
	},

	_initStyle: function () {
		if (this.options.stroke) {
			this._path.setAttribute('stroke-linejoin', 'round');
			this._path.setAttribute('stroke-linecap', 'round');
		}
		if (this.options.fill) {
			this._path.setAttribute('fill-rule', 'evenodd');
		}
		if (this.options.pointerEvents) {
			this._path.setAttribute('pointer-events', this.options.pointerEvents);
		}
		if (!this.options.clickable && !this.options.pointerEvents) {
			this._path.setAttribute('pointer-events', 'none');
		}
		this._updateStyle();
	},

	_updateStyle: function () {
		if (this.options.stroke) {
			this._path.setAttribute('stroke', this.options.color);
			this._path.setAttribute('stroke-opacity', this.options.opacity);
			this._path.setAttribute('stroke-width', this.options.weight);
			if (this.options.dashArray) {
				this._path.setAttribute('stroke-dasharray', this.options.dashArray);
			} else {
				this._path.removeAttribute('stroke-dasharray');
			}
			if (this.options.lineCap) {
				this._path.setAttribute('stroke-linecap', this.options.lineCap);
			}
			if (this.options.lineJoin) {
				this._path.setAttribute('stroke-linejoin', this.options.lineJoin);
			}
		} else {
			this._path.setAttribute('stroke', 'none');
		}
		if (this.options.fill) {
			this._path.setAttribute('fill', this.options.fillColor || this.options.color);
			this._path.setAttribute('fill-opacity', this.options.fillOpacity);
		} else {
			this._path.setAttribute('fill', 'none');
		}
	},

	_updatePath: function () {
		var str = this.getPathString();
		if (!str) {
			// fix webkit empty string parsing bug
			str = 'M0 0';
		}
		this._path.setAttribute('d', str);
	},

	// TODO remove duplication with L.Map
	_initEvents: function () {
		if (this.options.clickable) {
			if (L.Browser.svg || !L.Browser.vml) {
				L.DomUtil.addClass(this._path, 'leaflet-clickable');
			}

			L.DomEvent.on(this._container, 'click', this._onMouseClick, this);

			var events = ['dblclick', 'mousedown', 'mouseover',
			              'mouseout', 'mousemove', 'contextmenu'];
			for (var i = 0; i < events.length; i++) {
				L.DomEvent.on(this._container, events[i], this._fireMouseEvent, this);
			}
		}
	},

	_onMouseClick: function (e) {
		if (this._map.dragging && this._map.dragging.moved()) { return; }

		this._fireMouseEvent(e);
	},

	_fireMouseEvent: function (e) {
		if (!this.hasEventListeners(e.type)) { return; }

		var map = this._map,
		    containerPoint = map.mouseEventToContainerPoint(e),
		    layerPoint = map.containerPointToLayerPoint(containerPoint),
		    latlng = map.layerPointToLatLng(layerPoint);

		this.fire(e.type, {
			latlng: latlng,
			layerPoint: layerPoint,
			containerPoint: containerPoint,
			originalEvent: e
		});

		if (e.type === 'contextmenu') {
			L.DomEvent.preventDefault(e);
		}
		if (e.type !== 'mousemove') {
			L.DomEvent.stopPropagation(e);
		}
	}
});

L.Map.include({
	_initPathRoot: function () {
		if (!this._pathRoot) {
			this._pathRoot = L.Path.prototype._createElement('svg');
			this._panes.overlayPane.appendChild(this._pathRoot);

			if (this.options.zoomAnimation && L.Browser.any3d) {
				L.DomUtil.addClass(this._pathRoot, 'leaflet-zoom-animated');

				this.on({
					'zoomanim': this._animatePathZoom,
					'zoomend': this._endPathZoom
				});
			} else {
				L.DomUtil.addClass(this._pathRoot, 'leaflet-zoom-hide');
			}

			this.on('moveend', this._updateSvgViewport);
			this._updateSvgViewport();
		}
	},

	_animatePathZoom: function (e) {
		var scale = this.getZoomScale(e.zoom),
		    offset = this._getCenterOffset(e.center)._multiplyBy(-scale)._add(this._pathViewport.min);

		this._pathRoot.style[L.DomUtil.TRANSFORM] =
		        L.DomUtil.getTranslateString(offset) + ' scale(' + scale + ') ';

		this._pathZooming = true;
	},

	_endPathZoom: function () {
		this._pathZooming = false;
	},

	_updateSvgViewport: function () {

		if (this._pathZooming) {
			// Do not update SVGs while a zoom animation is going on otherwise the animation will break.
			// When the zoom animation ends we will be updated again anyway
			// This fixes the case where you do a momentum move and zoom while the move is still ongoing.
			return;
		}

		this._updatePathViewport();

		var vp = this._pathViewport,
		    min = vp.min,
		    max = vp.max,
		    width = max.x - min.x,
		    height = max.y - min.y,
		    root = this._pathRoot,
		    pane = this._panes.overlayPane;

		// Hack to make flicker on drag end on mobile webkit less irritating
		if (L.Browser.mobileWebkit) {
			pane.removeChild(root);
		}

		L.DomUtil.setPosition(root, min);
		root.setAttribute('width', width);
		root.setAttribute('height', height);
		root.setAttribute('viewBox', [min.x, min.y, width, height].join(' '));

		if (L.Browser.mobileWebkit) {
			pane.appendChild(root);
		}
	}
});


/*
 * Popup extension to L.Path (polylines, polygons, circles), adding popup-related methods.
 */

L.Path.include({

	bindPopup: function (content, options) {

		if (content instanceof L.Popup) {
			this._popup = content;
		} else {
			if (!this._popup || options) {
				this._popup = new L.Popup(options, this);
			}
			this._popup.setContent(content);
		}

		if (!this._popupHandlersAdded) {
			this
			    .on('click', this._openPopup, this)
			    .on('remove', this.closePopup, this);

			this._popupHandlersAdded = true;
		}

		return this;
	},

	unbindPopup: function () {
		if (this._popup) {
			this._popup = null;
			this
			    .off('click', this._openPopup)
			    .off('remove', this.closePopup);

			this._popupHandlersAdded = false;
		}
		return this;
	},

	openPopup: function (latlng) {

		if (this._popup) {
			// open the popup from one of the path's points if not specified
			latlng = latlng || this._latlng ||
			         this._latlngs[Math.floor(this._latlngs.length / 2)];

			this._openPopup({latlng: latlng});
		}

		return this;
	},

	closePopup: function () {
		if (this._popup) {
			this._popup._close();
		}
		return this;
	},

	_openPopup: function (e) {
		this._popup.setLatLng(e.latlng);
		this._map.openPopup(this._popup);
	}
});


/*
 * Vector rendering for IE6-8 through VML.
 * Thanks to Dmitry Baranovsky and his Raphael library for inspiration!
 */

L.Browser.vml = !L.Browser.svg && (function () {
	try {
		var div = document.createElement('div');
		div.innerHTML = '<v:shape adj="1"/>';

		var shape = div.firstChild;
		shape.style.behavior = 'url(#default#VML)';

		return shape && (typeof shape.adj === 'object');

	} catch (e) {
		return false;
	}
}());

L.Path = L.Browser.svg || !L.Browser.vml ? L.Path : L.Path.extend({
	statics: {
		VML: true,
		CLIP_PADDING: 0.02
	},

	_createElement: (function () {
		try {
			document.namespaces.add('lvml', 'urn:schemas-microsoft-com:vml');
			return function (name) {
				return document.createElement('<lvml:' + name + ' class="lvml">');
			};
		} catch (e) {
			return function (name) {
				return document.createElement(
				        '<' + name + ' xmlns="urn:schemas-microsoft.com:vml" class="lvml">');
			};
		}
	}()),

	_initPath: function () {
		var container = this._container = this._createElement('shape');

		L.DomUtil.addClass(container, 'leaflet-vml-shape' +
			(this.options.className ? ' ' + this.options.className : ''));

		if (this.options.clickable) {
			L.DomUtil.addClass(container, 'leaflet-clickable');
		}

		container.coordsize = '1 1';

		this._path = this._createElement('path');
		container.appendChild(this._path);

		this._map._pathRoot.appendChild(container);
	},

	_initStyle: function () {
		this._updateStyle();
	},

	_updateStyle: function () {
		var stroke = this._stroke,
		    fill = this._fill,
		    options = this.options,
		    container = this._container;

		container.stroked = options.stroke;
		container.filled = options.fill;

		if (options.stroke) {
			if (!stroke) {
				stroke = this._stroke = this._createElement('stroke');
				stroke.endcap = 'round';
				container.appendChild(stroke);
			}
			stroke.weight = options.weight + 'px';
			stroke.color = options.color;
			stroke.opacity = options.opacity;

			if (options.dashArray) {
				stroke.dashStyle = L.Util.isArray(options.dashArray) ?
				    options.dashArray.join(' ') :
				    options.dashArray.replace(/( *, *)/g, ' ');
			} else {
				stroke.dashStyle = '';
			}
			if (options.lineCap) {
				stroke.endcap = options.lineCap.replace('butt', 'flat');
			}
			if (options.lineJoin) {
				stroke.joinstyle = options.lineJoin;
			}

		} else if (stroke) {
			container.removeChild(stroke);
			this._stroke = null;
		}

		if (options.fill) {
			if (!fill) {
				fill = this._fill = this._createElement('fill');
				container.appendChild(fill);
			}
			fill.color = options.fillColor || options.color;
			fill.opacity = options.fillOpacity;

		} else if (fill) {
			container.removeChild(fill);
			this._fill = null;
		}
	},

	_updatePath: function () {
		var style = this._container.style;

		style.display = 'none';
		this._path.v = this.getPathString() + ' '; // the space fixes IE empty path string bug
		style.display = '';
	}
});

L.Map.include(L.Browser.svg || !L.Browser.vml ? {} : {
	_initPathRoot: function () {
		if (this._pathRoot) { return; }

		var root = this._pathRoot = document.createElement('div');
		root.className = 'leaflet-vml-container';
		this._panes.overlayPane.appendChild(root);

		this.on('moveend', this._updatePathViewport);
		this._updatePathViewport();
	}
});


/*
 * Vector rendering for all browsers that support canvas.
 */

L.Browser.canvas = (function () {
	return !!document.createElement('canvas').getContext;
}());

L.Path = (L.Path.SVG && !window.L_PREFER_CANVAS) || !L.Browser.canvas ? L.Path : L.Path.extend({
	statics: {
		//CLIP_PADDING: 0.02, // not sure if there's a need to set it to a small value
		CANVAS: true,
		SVG: false
	},

	redraw: function () {
		if (this._map) {
			this.projectLatlngs();
			this._requestUpdate();
		}
		return this;
	},

	setStyle: function (style) {
		L.setOptions(this, style);

		if (this._map) {
			this._updateStyle();
			this._requestUpdate();
		}
		return this;
	},

	onRemove: function (map) {
		map
		    .off('viewreset', this.projectLatlngs, this)
		    .off('moveend', this._updatePath, this);

		if (this.options.clickable) {
			this._map.off('click', this._onClick, this);
			this._map.off('mousemove', this._onMouseMove, this);
		}

		this._requestUpdate();
		
		this.fire('remove');
		this._map = null;
	},

	_requestUpdate: function () {
		if (this._map && !L.Path._updateRequest) {
			L.Path._updateRequest = L.Util.requestAnimFrame(this._fireMapMoveEnd, this._map);
		}
	},

	_fireMapMoveEnd: function () {
		L.Path._updateRequest = null;
		this.fire('moveend');
	},

	_initElements: function () {
		this._map._initPathRoot();
		this._ctx = this._map._canvasCtx;
	},

	_updateStyle: function () {
		var options = this.options;

		if (options.stroke) {
			this._ctx.lineWidth = options.weight;
			this._ctx.strokeStyle = options.color;
		}
		if (options.fill) {
			this._ctx.fillStyle = options.fillColor || options.color;
		}
	},

	_drawPath: function () {
		var i, j, len, len2, point, drawMethod;

		this._ctx.beginPath();

		for (i = 0, len = this._parts.length; i < len; i++) {
			for (j = 0, len2 = this._parts[i].length; j < len2; j++) {
				point = this._parts[i][j];
				drawMethod = (j === 0 ? 'move' : 'line') + 'To';

				this._ctx[drawMethod](point.x, point.y);
			}
			// TODO refactor ugly hack
			if (this instanceof L.Polygon) {
				this._ctx.closePath();
			}
		}
	},

	_checkIfEmpty: function () {
		return !this._parts.length;
	},

	_updatePath: function () {
		if (this._checkIfEmpty()) { return; }

		var ctx = this._ctx,
		    options = this.options;

		this._drawPath();
		ctx.save();
		this._updateStyle();

		if (options.fill) {
			ctx.globalAlpha = options.fillOpacity;
			ctx.fill();
		}

		if (options.stroke) {
			ctx.globalAlpha = options.opacity;
			ctx.stroke();
		}

		ctx.restore();

		// TODO optimization: 1 fill/stroke for all features with equal style instead of 1 for each feature
	},

	_initEvents: function () {
		if (this.options.clickable) {
			// TODO dblclick
			this._map.on('mousemove', this._onMouseMove, this);
			this._map.on('click', this._onClick, this);
		}
	},

	_onClick: function (e) {
		if (this._containsPoint(e.layerPoint)) {
			this.fire('click', e);
		}
	},

	_onMouseMove: function (e) {
		if (!this._map || this._map._animatingZoom) { return; }

		// TODO don't do on each move
		if (this._containsPoint(e.layerPoint)) {
			this._ctx.canvas.style.cursor = 'pointer';
			this._mouseInside = true;
			this.fire('mouseover', e);

		} else if (this._mouseInside) {
			this._ctx.canvas.style.cursor = '';
			this._mouseInside = false;
			this.fire('mouseout', e);
		}
	}
});

L.Map.include((L.Path.SVG && !window.L_PREFER_CANVAS) || !L.Browser.canvas ? {} : {
	_initPathRoot: function () {
		var root = this._pathRoot,
		    ctx;

		if (!root) {
			root = this._pathRoot = document.createElement('canvas');
			root.style.position = 'absolute';
			ctx = this._canvasCtx = root.getContext('2d');

			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';

			this._panes.overlayPane.appendChild(root);

			if (this.options.zoomAnimation) {
				this._pathRoot.className = 'leaflet-zoom-animated';
				this.on('zoomanim', this._animatePathZoom);
				this.on('zoomend', this._endPathZoom);
			}
			this.on('moveend', this._updateCanvasViewport);
			this._updateCanvasViewport();
		}
	},

	_updateCanvasViewport: function () {
		// don't redraw while zooming. See _updateSvgViewport for more details
		if (this._pathZooming) { return; }
		this._updatePathViewport();

		var vp = this._pathViewport,
		    min = vp.min,
		    size = vp.max.subtract(min),
		    root = this._pathRoot;

		//TODO check if this works properly on mobile webkit
		L.DomUtil.setPosition(root, min);
		root.width = size.x;
		root.height = size.y;
		root.getContext('2d').translate(-min.x, -min.y);
	}
});


/*
 * L.LineUtil contains different utility functions for line segments
 * and polylines (clipping, simplification, distances, etc.)
 */

/*jshint bitwise:false */ // allow bitwise operations for this file

L.LineUtil = {

	// Simplify polyline with vertex reduction and Douglas-Peucker simplification.
	// Improves rendering performance dramatically by lessening the number of points to draw.

	simplify: function (/*Point[]*/ points, /*Number*/ tolerance) {
		if (!tolerance || !points.length) {
			return points.slice();
		}

		var sqTolerance = tolerance * tolerance;

		// stage 1: vertex reduction
		points = this._reducePoints(points, sqTolerance);

		// stage 2: Douglas-Peucker simplification
		points = this._simplifyDP(points, sqTolerance);

		return points;
	},

	// distance from a point to a segment between two points
	pointToSegmentDistance:  function (/*Point*/ p, /*Point*/ p1, /*Point*/ p2) {
		return Math.sqrt(this._sqClosestPointOnSegment(p, p1, p2, true));
	},

	closestPointOnSegment: function (/*Point*/ p, /*Point*/ p1, /*Point*/ p2) {
		return this._sqClosestPointOnSegment(p, p1, p2);
	},

	// Douglas-Peucker simplification, see http://en.wikipedia.org/wiki/Douglas-Peucker_algorithm
	_simplifyDP: function (points, sqTolerance) {

		var len = points.length,
		    ArrayConstructor = typeof Uint8Array !== undefined + '' ? Uint8Array : Array,
		    markers = new ArrayConstructor(len);

		markers[0] = markers[len - 1] = 1;

		this._simplifyDPStep(points, markers, sqTolerance, 0, len - 1);

		var i,
		    newPoints = [];

		for (i = 0; i < len; i++) {
			if (markers[i]) {
				newPoints.push(points[i]);
			}
		}

		return newPoints;
	},

	_simplifyDPStep: function (points, markers, sqTolerance, first, last) {

		var maxSqDist = 0,
		    index, i, sqDist;

		for (i = first + 1; i <= last - 1; i++) {
			sqDist = this._sqClosestPointOnSegment(points[i], points[first], points[last], true);

			if (sqDist > maxSqDist) {
				index = i;
				maxSqDist = sqDist;
			}
		}

		if (maxSqDist > sqTolerance) {
			markers[index] = 1;

			this._simplifyDPStep(points, markers, sqTolerance, first, index);
			this._simplifyDPStep(points, markers, sqTolerance, index, last);
		}
	},

	// reduce points that are too close to each other to a single point
	_reducePoints: function (points, sqTolerance) {
		var reducedPoints = [points[0]];

		for (var i = 1, prev = 0, len = points.length; i < len; i++) {
			if (this._sqDist(points[i], points[prev]) > sqTolerance) {
				reducedPoints.push(points[i]);
				prev = i;
			}
		}
		if (prev < len - 1) {
			reducedPoints.push(points[len - 1]);
		}
		return reducedPoints;
	},

	// Cohen-Sutherland line clipping algorithm.
	// Used to avoid rendering parts of a polyline that are not currently visible.

	clipSegment: function (a, b, bounds, useLastCode) {
		var codeA = useLastCode ? this._lastCode : this._getBitCode(a, bounds),
		    codeB = this._getBitCode(b, bounds),

		    codeOut, p, newCode;

		// save 2nd code to avoid calculating it on the next segment
		this._lastCode = codeB;

		while (true) {
			// if a,b is inside the clip window (trivial accept)
			if (!(codeA | codeB)) {
				return [a, b];
			// if a,b is outside the clip window (trivial reject)
			} else if (codeA & codeB) {
				return false;
			// other cases
			} else {
				codeOut = codeA || codeB;
				p = this._getEdgeIntersection(a, b, codeOut, bounds);
				newCode = this._getBitCode(p, bounds);

				if (codeOut === codeA) {
					a = p;
					codeA = newCode;
				} else {
					b = p;
					codeB = newCode;
				}
			}
		}
	},

	_getEdgeIntersection: function (a, b, code, bounds) {
		var dx = b.x - a.x,
		    dy = b.y - a.y,
		    min = bounds.min,
		    max = bounds.max;

		if (code & 8) { // top
			return new L.Point(a.x + dx * (max.y - a.y) / dy, max.y);
		} else if (code & 4) { // bottom
			return new L.Point(a.x + dx * (min.y - a.y) / dy, min.y);
		} else if (code & 2) { // right
			return new L.Point(max.x, a.y + dy * (max.x - a.x) / dx);
		} else if (code & 1) { // left
			return new L.Point(min.x, a.y + dy * (min.x - a.x) / dx);
		}
	},

	_getBitCode: function (/*Point*/ p, bounds) {
		var code = 0;

		if (p.x < bounds.min.x) { // left
			code |= 1;
		} else if (p.x > bounds.max.x) { // right
			code |= 2;
		}
		if (p.y < bounds.min.y) { // bottom
			code |= 4;
		} else if (p.y > bounds.max.y) { // top
			code |= 8;
		}

		return code;
	},

	// square distance (to avoid unnecessary Math.sqrt calls)
	_sqDist: function (p1, p2) {
		var dx = p2.x - p1.x,
		    dy = p2.y - p1.y;
		return dx * dx + dy * dy;
	},

	// return closest point on segment or distance to that point
	_sqClosestPointOnSegment: function (p, p1, p2, sqDist) {
		var x = p1.x,
		    y = p1.y,
		    dx = p2.x - x,
		    dy = p2.y - y,
		    dot = dx * dx + dy * dy,
		    t;

		if (dot > 0) {
			t = ((p.x - x) * dx + (p.y - y) * dy) / dot;

			if (t > 1) {
				x = p2.x;
				y = p2.y;
			} else if (t > 0) {
				x += dx * t;
				y += dy * t;
			}
		}

		dx = p.x - x;
		dy = p.y - y;

		return sqDist ? dx * dx + dy * dy : new L.Point(x, y);
	}
};


/*
 * L.Polyline is used to display polylines on a map.
 */

L.Polyline = L.Path.extend({
	initialize: function (latlngs, options) {
		L.Path.prototype.initialize.call(this, options);

		this._latlngs = this._convertLatLngs(latlngs);
	},

	options: {
		// how much to simplify the polyline on each zoom level
		// more = better performance and smoother look, less = more accurate
		smoothFactor: 1.0,
		noClip: false
	},

	projectLatlngs: function () {
		this._originalPoints = [];

		for (var i = 0, len = this._latlngs.length; i < len; i++) {
			this._originalPoints[i] = this._map.latLngToLayerPoint(this._latlngs[i]);
		}
	},

	getPathString: function () {
		for (var i = 0, len = this._parts.length, str = ''; i < len; i++) {
			str += this._getPathPartStr(this._parts[i]);
		}
		return str;
	},

	getLatLngs: function () {
		return this._latlngs;
	},

	setLatLngs: function (latlngs) {
		this._latlngs = this._convertLatLngs(latlngs);
		return this.redraw();
	},

	addLatLng: function (latlng) {
		this._latlngs.push(L.latLng(latlng));
		return this.redraw();
	},

	spliceLatLngs: function () { // (Number index, Number howMany)
		var removed = [].splice.apply(this._latlngs, arguments);
		this._convertLatLngs(this._latlngs, true);
		this.redraw();
		return removed;
	},

	closestLayerPoint: function (p) {
		var minDistance = Infinity, parts = this._parts, p1, p2, minPoint = null;

		for (var j = 0, jLen = parts.length; j < jLen; j++) {
			var points = parts[j];
			for (var i = 1, len = points.length; i < len; i++) {
				p1 = points[i - 1];
				p2 = points[i];
				var sqDist = L.LineUtil._sqClosestPointOnSegment(p, p1, p2, true);
				if (sqDist < minDistance) {
					minDistance = sqDist;
					minPoint = L.LineUtil._sqClosestPointOnSegment(p, p1, p2);
				}
			}
		}
		if (minPoint) {
			minPoint.distance = Math.sqrt(minDistance);
		}
		return minPoint;
	},

	getBounds: function () {
		return new L.LatLngBounds(this.getLatLngs());
	},

	_convertLatLngs: function (latlngs, overwrite) {
		var i, len, target = overwrite ? latlngs : [];

		for (i = 0, len = latlngs.length; i < len; i++) {
			if (L.Util.isArray(latlngs[i]) && typeof latlngs[i][0] !== 'number') {
				return;
			}
			target[i] = L.latLng(latlngs[i]);
		}
		return target;
	},

	_initEvents: function () {
		L.Path.prototype._initEvents.call(this);
	},

	_getPathPartStr: function (points) {
		var round = L.Path.VML;

		for (var j = 0, len2 = points.length, str = '', p; j < len2; j++) {
			p = points[j];
			if (round) {
				p._round();
			}
			str += (j ? 'L' : 'M') + p.x + ' ' + p.y;
		}
		return str;
	},

	_clipPoints: function () {
		var points = this._originalPoints,
		    len = points.length,
		    i, k, segment;

		if (this.options.noClip) {
			this._parts = [points];
			return;
		}

		this._parts = [];

		var parts = this._parts,
		    vp = this._map._pathViewport,
		    lu = L.LineUtil;

		for (i = 0, k = 0; i < len - 1; i++) {
			segment = lu.clipSegment(points[i], points[i + 1], vp, i);
			if (!segment) {
				continue;
			}

			parts[k] = parts[k] || [];
			parts[k].push(segment[0]);

			// if segment goes out of screen, or it's the last one, it's the end of the line part
			if ((segment[1] !== points[i + 1]) || (i === len - 2)) {
				parts[k].push(segment[1]);
				k++;
			}
		}
	},

	// simplify each clipped part of the polyline
	_simplifyPoints: function () {
		var parts = this._parts,
		    lu = L.LineUtil;

		for (var i = 0, len = parts.length; i < len; i++) {
			parts[i] = lu.simplify(parts[i], this.options.smoothFactor);
		}
	},

	_updatePath: function () {
		if (!this._map) { return; }

		this._clipPoints();
		this._simplifyPoints();

		L.Path.prototype._updatePath.call(this);
	}
});

L.polyline = function (latlngs, options) {
	return new L.Polyline(latlngs, options);
};


/*
 * L.PolyUtil contains utility functions for polygons (clipping, etc.).
 */

/*jshint bitwise:false */ // allow bitwise operations here

L.PolyUtil = {};

/*
 * Sutherland-Hodgeman polygon clipping algorithm.
 * Used to avoid rendering parts of a polygon that are not currently visible.
 */
L.PolyUtil.clipPolygon = function (points, bounds) {
	var clippedPoints,
	    edges = [1, 4, 2, 8],
	    i, j, k,
	    a, b,
	    len, edge, p,
	    lu = L.LineUtil;

	for (i = 0, len = points.length; i < len; i++) {
		points[i]._code = lu._getBitCode(points[i], bounds);
	}

	// for each edge (left, bottom, right, top)
	for (k = 0; k < 4; k++) {
		edge = edges[k];
		clippedPoints = [];

		for (i = 0, len = points.length, j = len - 1; i < len; j = i++) {
			a = points[i];
			b = points[j];

			// if a is inside the clip window
			if (!(a._code & edge)) {
				// if b is outside the clip window (a->b goes out of screen)
				if (b._code & edge) {
					p = lu._getEdgeIntersection(b, a, edge, bounds);
					p._code = lu._getBitCode(p, bounds);
					clippedPoints.push(p);
				}
				clippedPoints.push(a);

			// else if b is inside the clip window (a->b enters the screen)
			} else if (!(b._code & edge)) {
				p = lu._getEdgeIntersection(b, a, edge, bounds);
				p._code = lu._getBitCode(p, bounds);
				clippedPoints.push(p);
			}
		}
		points = clippedPoints;
	}

	return points;
};


/*
 * L.Polygon is used to display polygons on a map.
 */

L.Polygon = L.Polyline.extend({
	options: {
		fill: true
	},

	initialize: function (latlngs, options) {
		L.Polyline.prototype.initialize.call(this, latlngs, options);
		this._initWithHoles(latlngs);
	},

	_initWithHoles: function (latlngs) {
		var i, len, hole;
		if (latlngs && L.Util.isArray(latlngs[0]) && (typeof latlngs[0][0] !== 'number')) {
			this._latlngs = this._convertLatLngs(latlngs[0]);
			this._holes = latlngs.slice(1);

			for (i = 0, len = this._holes.length; i < len; i++) {
				hole = this._holes[i] = this._convertLatLngs(this._holes[i]);
				if (hole[0].equals(hole[hole.length - 1])) {
					hole.pop();
				}
			}
		}

		// filter out last point if its equal to the first one
		latlngs = this._latlngs;

		if (latlngs.length >= 2 && latlngs[0].equals(latlngs[latlngs.length - 1])) {
			latlngs.pop();
		}
	},

	projectLatlngs: function () {
		L.Polyline.prototype.projectLatlngs.call(this);

		// project polygon holes points
		// TODO move this logic to Polyline to get rid of duplication
		this._holePoints = [];

		if (!this._holes) { return; }

		var i, j, len, len2;

		for (i = 0, len = this._holes.length; i < len; i++) {
			this._holePoints[i] = [];

			for (j = 0, len2 = this._holes[i].length; j < len2; j++) {
				this._holePoints[i][j] = this._map.latLngToLayerPoint(this._holes[i][j]);
			}
		}
	},

	setLatLngs: function (latlngs) {
		if (latlngs && L.Util.isArray(latlngs[0]) && (typeof latlngs[0][0] !== 'number')) {
			this._initWithHoles(latlngs);
			return this.redraw();
		} else {
			return L.Polyline.prototype.setLatLngs.call(this, latlngs);
		}
	},

	_clipPoints: function () {
		var points = this._originalPoints,
		    newParts = [];

		this._parts = [points].concat(this._holePoints);

		if (this.options.noClip) { return; }

		for (var i = 0, len = this._parts.length; i < len; i++) {
			var clipped = L.PolyUtil.clipPolygon(this._parts[i], this._map._pathViewport);
			if (clipped.length) {
				newParts.push(clipped);
			}
		}

		this._parts = newParts;
	},

	_getPathPartStr: function (points) {
		var str = L.Polyline.prototype._getPathPartStr.call(this, points);
		return str + (L.Browser.svg ? 'z' : 'x');
	}
});

L.polygon = function (latlngs, options) {
	return new L.Polygon(latlngs, options);
};


/*
 * Contains L.MultiPolyline and L.MultiPolygon layers.
 */

(function () {
	function createMulti(Klass) {

		return L.FeatureGroup.extend({

			initialize: function (latlngs, options) {
				this._layers = {};
				this._options = options;
				this.setLatLngs(latlngs);
			},

			setLatLngs: function (latlngs) {
				var i = 0,
				    len = latlngs.length;

				this.eachLayer(function (layer) {
					if (i < len) {
						layer.setLatLngs(latlngs[i++]);
					} else {
						this.removeLayer(layer);
					}
				}, this);

				while (i < len) {
					this.addLayer(new Klass(latlngs[i++], this._options));
				}

				return this;
			},

			getLatLngs: function () {
				var latlngs = [];

				this.eachLayer(function (layer) {
					latlngs.push(layer.getLatLngs());
				});

				return latlngs;
			}
		});
	}

	L.MultiPolyline = createMulti(L.Polyline);
	L.MultiPolygon = createMulti(L.Polygon);

	L.multiPolyline = function (latlngs, options) {
		return new L.MultiPolyline(latlngs, options);
	};

	L.multiPolygon = function (latlngs, options) {
		return new L.MultiPolygon(latlngs, options);
	};
}());


/*
 * L.Rectangle extends Polygon and creates a rectangle when passed a LatLngBounds object.
 */

L.Rectangle = L.Polygon.extend({
	initialize: function (latLngBounds, options) {
		L.Polygon.prototype.initialize.call(this, this._boundsToLatLngs(latLngBounds), options);
	},

	setBounds: function (latLngBounds) {
		this.setLatLngs(this._boundsToLatLngs(latLngBounds));
	},

	_boundsToLatLngs: function (latLngBounds) {
		latLngBounds = L.latLngBounds(latLngBounds);
		return [
			latLngBounds.getSouthWest(),
			latLngBounds.getNorthWest(),
			latLngBounds.getNorthEast(),
			latLngBounds.getSouthEast()
		];
	}
});

L.rectangle = function (latLngBounds, options) {
	return new L.Rectangle(latLngBounds, options);
};


/*
 * L.Circle is a circle overlay (with a certain radius in meters).
 */

L.Circle = L.Path.extend({
	initialize: function (latlng, radius, options) {
		L.Path.prototype.initialize.call(this, options);

		this._latlng = L.latLng(latlng);
		this._mRadius = radius;
	},

	options: {
		fill: true
	},

	setLatLng: function (latlng) {
		this._latlng = L.latLng(latlng);
		return this.redraw();
	},

	setRadius: function (radius) {
		this._mRadius = radius;
		return this.redraw();
	},

	projectLatlngs: function () {
		var lngRadius = this._getLngRadius(),
		    latlng = this._latlng,
		    pointLeft = this._map.latLngToLayerPoint([latlng.lat, latlng.lng - lngRadius]);

		this._point = this._map.latLngToLayerPoint(latlng);
		this._radius = Math.max(this._point.x - pointLeft.x, 1);
	},

	getBounds: function () {
		var lngRadius = this._getLngRadius(),
		    latRadius = (this._mRadius / 40075017) * 360,
		    latlng = this._latlng;

		return new L.LatLngBounds(
		        [latlng.lat - latRadius, latlng.lng - lngRadius],
		        [latlng.lat + latRadius, latlng.lng + lngRadius]);
	},

	getLatLng: function () {
		return this._latlng;
	},

	getPathString: function () {
		var p = this._point,
		    r = this._radius;

		if (this._checkIfEmpty()) {
			return '';
		}

		if (L.Browser.svg) {
			return 'M' + p.x + ',' + (p.y - r) +
			       'A' + r + ',' + r + ',0,1,1,' +
			       (p.x - 0.1) + ',' + (p.y - r) + ' z';
		} else {
			p._round();
			r = Math.round(r);
			return 'AL ' + p.x + ',' + p.y + ' ' + r + ',' + r + ' 0,' + (65535 * 360);
		}
	},

	getRadius: function () {
		return this._mRadius;
	},

	// TODO Earth hardcoded, move into projection code!

	_getLatRadius: function () {
		return (this._mRadius / 40075017) * 360;
	},

	_getLngRadius: function () {
		return this._getLatRadius() / Math.cos(L.LatLng.DEG_TO_RAD * this._latlng.lat);
	},

	_checkIfEmpty: function () {
		if (!this._map) {
			return false;
		}
		var vp = this._map._pathViewport,
		    r = this._radius,
		    p = this._point;

		return p.x - r > vp.max.x || p.y - r > vp.max.y ||
		       p.x + r < vp.min.x || p.y + r < vp.min.y;
	}
});

L.circle = function (latlng, radius, options) {
	return new L.Circle(latlng, radius, options);
};


/*
 * L.CircleMarker is a circle overlay with a permanent pixel radius.
 */

L.CircleMarker = L.Circle.extend({
	options: {
		radius: 10,
		weight: 2
	},

	initialize: function (latlng, options) {
		L.Circle.prototype.initialize.call(this, latlng, null, options);
		this._radius = this.options.radius;
	},

	projectLatlngs: function () {
		this._point = this._map.latLngToLayerPoint(this._latlng);
	},

	_updateStyle : function () {
		L.Circle.prototype._updateStyle.call(this);
		this.setRadius(this.options.radius);
	},

	setLatLng: function (latlng) {
		L.Circle.prototype.setLatLng.call(this, latlng);
		if (this._popup && this._popup._isOpen) {
			this._popup.setLatLng(latlng);
		}
		return this;
	},

	setRadius: function (radius) {
		this.options.radius = this._radius = radius;
		return this.redraw();
	},

	getRadius: function () {
		return this._radius;
	}
});

L.circleMarker = function (latlng, options) {
	return new L.CircleMarker(latlng, options);
};


/*
 * Extends L.Polyline to be able to manually detect clicks on Canvas-rendered polylines.
 */

L.Polyline.include(!L.Path.CANVAS ? {} : {
	_containsPoint: function (p, closed) {
		var i, j, k, len, len2, dist, part,
		    w = this.options.weight / 2;

		if (L.Browser.touch) {
			w += 10; // polyline click tolerance on touch devices
		}

		for (i = 0, len = this._parts.length; i < len; i++) {
			part = this._parts[i];
			for (j = 0, len2 = part.length, k = len2 - 1; j < len2; k = j++) {
				if (!closed && (j === 0)) {
					continue;
				}

				dist = L.LineUtil.pointToSegmentDistance(p, part[k], part[j]);

				if (dist <= w) {
					return true;
				}
			}
		}
		return false;
	}
});


/*
 * Extends L.Polygon to be able to manually detect clicks on Canvas-rendered polygons.
 */

L.Polygon.include(!L.Path.CANVAS ? {} : {
	_containsPoint: function (p) {
		var inside = false,
		    part, p1, p2,
		    i, j, k,
		    len, len2;

		// TODO optimization: check if within bounds first

		if (L.Polyline.prototype._containsPoint.call(this, p, true)) {
			// click on polygon border
			return true;
		}

		// ray casting algorithm for detecting if point is in polygon

		for (i = 0, len = this._parts.length; i < len; i++) {
			part = this._parts[i];

			for (j = 0, len2 = part.length, k = len2 - 1; j < len2; k = j++) {
				p1 = part[j];
				p2 = part[k];

				if (((p1.y > p.y) !== (p2.y > p.y)) &&
						(p.x < (p2.x - p1.x) * (p.y - p1.y) / (p2.y - p1.y) + p1.x)) {
					inside = !inside;
				}
			}
		}

		return inside;
	}
});


/*
 * Extends L.Circle with Canvas-specific code.
 */

L.Circle.include(!L.Path.CANVAS ? {} : {
	_drawPath: function () {
		var p = this._point;
		this._ctx.beginPath();
		this._ctx.arc(p.x, p.y, this._radius, 0, Math.PI * 2, false);
	},

	_containsPoint: function (p) {
		var center = this._point,
		    w2 = this.options.stroke ? this.options.weight / 2 : 0;

		return (p.distanceTo(center) <= this._radius + w2);
	}
});


/*
 * CircleMarker canvas specific drawing parts.
 */

L.CircleMarker.include(!L.Path.CANVAS ? {} : {
	_updateStyle: function () {
		L.Path.prototype._updateStyle.call(this);
	}
});


/*
 * L.GeoJSON turns any GeoJSON data into a Leaflet layer.
 */

L.GeoJSON = L.FeatureGroup.extend({

	initialize: function (geojson, options) {
		L.setOptions(this, options);

		this._layers = {};

		if (geojson) {
			this.addData(geojson);
		}
	},

	addData: function (geojson) {
		var features = L.Util.isArray(geojson) ? geojson : geojson.features,
		    i, len, feature;

		if (features) {
			for (i = 0, len = features.length; i < len; i++) {
				// Only add this if geometry or geometries are set and not null
				feature = features[i];
				if (feature.geometries || feature.geometry || feature.features || feature.coordinates) {
					this.addData(features[i]);
				}
			}
			return this;
		}

		var options = this.options;

		if (options.filter && !options.filter(geojson)) { return; }

		var layer = L.GeoJSON.geometryToLayer(geojson, options.pointToLayer, options.coordsToLatLng, options);
		layer.feature = L.GeoJSON.asFeature(geojson);

		layer.defaultOptions = layer.options;
		this.resetStyle(layer);

		if (options.onEachFeature) {
			options.onEachFeature(geojson, layer);
		}

		return this.addLayer(layer);
	},

	resetStyle: function (layer) {
		var style = this.options.style;
		if (style) {
			// reset any custom styles
			L.Util.extend(layer.options, layer.defaultOptions);

			this._setLayerStyle(layer, style);
		}
	},

	setStyle: function (style) {
		this.eachLayer(function (layer) {
			this._setLayerStyle(layer, style);
		}, this);
	},

	_setLayerStyle: function (layer, style) {
		if (typeof style === 'function') {
			style = style(layer.feature);
		}
		if (layer.setStyle) {
			layer.setStyle(style);
		}
	}
});

L.extend(L.GeoJSON, {
	geometryToLayer: function (geojson, pointToLayer, coordsToLatLng, vectorOptions) {
		var geometry = geojson.type === 'Feature' ? geojson.geometry : geojson,
		    coords = geometry.coordinates,
		    layers = [],
		    latlng, latlngs, i, len;

		coordsToLatLng = coordsToLatLng || this.coordsToLatLng;

		switch (geometry.type) {
		case 'Point':
			latlng = coordsToLatLng(coords);
			return pointToLayer ? pointToLayer(geojson, latlng) : new L.Marker(latlng);

		case 'MultiPoint':
			for (i = 0, len = coords.length; i < len; i++) {
				latlng = coordsToLatLng(coords[i]);
				layers.push(pointToLayer ? pointToLayer(geojson, latlng) : new L.Marker(latlng));
			}
			return new L.FeatureGroup(layers);

		case 'LineString':
			latlngs = this.coordsToLatLngs(coords, 0, coordsToLatLng);
			return new L.Polyline(latlngs, vectorOptions);

		case 'Polygon':
			if (coords.length === 2 && !coords[1].length) {
				throw new Error('Invalid GeoJSON object.');
			}
			latlngs = this.coordsToLatLngs(coords, 1, coordsToLatLng);
			return new L.Polygon(latlngs, vectorOptions);

		case 'MultiLineString':
			latlngs = this.coordsToLatLngs(coords, 1, coordsToLatLng);
			return new L.MultiPolyline(latlngs, vectorOptions);

		case 'MultiPolygon':
			latlngs = this.coordsToLatLngs(coords, 2, coordsToLatLng);
			return new L.MultiPolygon(latlngs, vectorOptions);

		case 'GeometryCollection':
			for (i = 0, len = geometry.geometries.length; i < len; i++) {

				layers.push(this.geometryToLayer({
					geometry: geometry.geometries[i],
					type: 'Feature',
					properties: geojson.properties
				}, pointToLayer, coordsToLatLng, vectorOptions));
			}
			return new L.FeatureGroup(layers);

		default:
			throw new Error('Invalid GeoJSON object.');
		}
	},

	coordsToLatLng: function (coords) { // (Array[, Boolean]) -> LatLng
		return new L.LatLng(coords[1], coords[0], coords[2]);
	},

	coordsToLatLngs: function (coords, levelsDeep, coordsToLatLng) { // (Array[, Number, Function]) -> Array
		var latlng, i, len,
		    latlngs = [];

		for (i = 0, len = coords.length; i < len; i++) {
			latlng = levelsDeep ?
			        this.coordsToLatLngs(coords[i], levelsDeep - 1, coordsToLatLng) :
			        (coordsToLatLng || this.coordsToLatLng)(coords[i]);

			latlngs.push(latlng);
		}

		return latlngs;
	},

	latLngToCoords: function (latlng) {
		var coords = [latlng.lng, latlng.lat];

		if (latlng.alt !== undefined) {
			coords.push(latlng.alt);
		}
		return coords;
	},

	latLngsToCoords: function (latLngs) {
		var coords = [];

		for (var i = 0, len = latLngs.length; i < len; i++) {
			coords.push(L.GeoJSON.latLngToCoords(latLngs[i]));
		}

		return coords;
	},

	getFeature: function (layer, newGeometry) {
		return layer.feature ? L.extend({}, layer.feature, {geometry: newGeometry}) : L.GeoJSON.asFeature(newGeometry);
	},

	asFeature: function (geoJSON) {
		if (geoJSON.type === 'Feature') {
			return geoJSON;
		}

		return {
			type: 'Feature',
			properties: {},
			geometry: geoJSON
		};
	}
});

var PointToGeoJSON = {
	toGeoJSON: function () {
		return L.GeoJSON.getFeature(this, {
			type: 'Point',
			coordinates: L.GeoJSON.latLngToCoords(this.getLatLng())
		});
	}
};

L.Marker.include(PointToGeoJSON);
L.Circle.include(PointToGeoJSON);
L.CircleMarker.include(PointToGeoJSON);

L.Polyline.include({
	toGeoJSON: function () {
		return L.GeoJSON.getFeature(this, {
			type: 'LineString',
			coordinates: L.GeoJSON.latLngsToCoords(this.getLatLngs())
		});
	}
});

L.Polygon.include({
	toGeoJSON: function () {
		var coords = [L.GeoJSON.latLngsToCoords(this.getLatLngs())],
		    i, len, hole;

		coords[0].push(coords[0][0]);

		if (this._holes) {
			for (i = 0, len = this._holes.length; i < len; i++) {
				hole = L.GeoJSON.latLngsToCoords(this._holes[i]);
				hole.push(hole[0]);
				coords.push(hole);
			}
		}

		return L.GeoJSON.getFeature(this, {
			type: 'Polygon',
			coordinates: coords
		});
	}
});

(function () {
	function multiToGeoJSON(type) {
		return function () {
			var coords = [];

			this.eachLayer(function (layer) {
				coords.push(layer.toGeoJSON().geometry.coordinates);
			});

			return L.GeoJSON.getFeature(this, {
				type: type,
				coordinates: coords
			});
		};
	}

	L.MultiPolyline.include({toGeoJSON: multiToGeoJSON('MultiLineString')});
	L.MultiPolygon.include({toGeoJSON: multiToGeoJSON('MultiPolygon')});

	L.LayerGroup.include({
		toGeoJSON: function () {

			var geometry = this.feature && this.feature.geometry,
				jsons = [],
				json;

			if (geometry && geometry.type === 'MultiPoint') {
				return multiToGeoJSON('MultiPoint').call(this);
			}

			var isGeometryCollection = geometry && geometry.type === 'GeometryCollection';

			this.eachLayer(function (layer) {
				if (layer.toGeoJSON) {
					json = layer.toGeoJSON();
					jsons.push(isGeometryCollection ? json.geometry : L.GeoJSON.asFeature(json));
				}
			});

			if (isGeometryCollection) {
				return L.GeoJSON.getFeature(this, {
					geometries: jsons,
					type: 'GeometryCollection'
				});
			}

			return {
				type: 'FeatureCollection',
				features: jsons
			};
		}
	});
}());

L.geoJson = function (geojson, options) {
	return new L.GeoJSON(geojson, options);
};


/*
 * L.DomEvent contains functions for working with DOM events.
 */

L.DomEvent = {
	/* inspired by John Resig, Dean Edwards and YUI addEvent implementations */
	addListener: function (obj, type, fn, context) { // (HTMLElement, String, Function[, Object])

		var id = L.stamp(fn),
		    key = '_leaflet_' + type + id,
		    handler, originalHandler, newType;

		if (obj[key]) { return this; }

		handler = function (e) {
			return fn.call(context || obj, e || L.DomEvent._getEvent());
		};

		if (L.Browser.pointer && type.indexOf('touch') === 0) {
			return this.addPointerListener(obj, type, handler, id);
		}
		if (L.Browser.touch && (type === 'dblclick') && this.addDoubleTapListener) {
			this.addDoubleTapListener(obj, handler, id);
		}

		if ('addEventListener' in obj) {

			if (type === 'mousewheel') {
				obj.addEventListener('DOMMouseScroll', handler, false);
				obj.addEventListener(type, handler, false);

			} else if ((type === 'mouseenter') || (type === 'mouseleave')) {

				originalHandler = handler;
				newType = (type === 'mouseenter' ? 'mouseover' : 'mouseout');

				handler = function (e) {
					if (!L.DomEvent._checkMouse(obj, e)) { return; }
					return originalHandler(e);
				};

				obj.addEventListener(newType, handler, false);

			} else if (type === 'click' && L.Browser.android) {
				originalHandler = handler;
				handler = function (e) {
					return L.DomEvent._filterClick(e, originalHandler);
				};

				obj.addEventListener(type, handler, false);
			} else {
				obj.addEventListener(type, handler, false);
			}

		} else if ('attachEvent' in obj) {
			obj.attachEvent('on' + type, handler);
		}

		obj[key] = handler;

		return this;
	},

	removeListener: function (obj, type, fn) {  // (HTMLElement, String, Function)

		var id = L.stamp(fn),
		    key = '_leaflet_' + type + id,
		    handler = obj[key];

		if (!handler) { return this; }

		if (L.Browser.pointer && type.indexOf('touch') === 0) {
			this.removePointerListener(obj, type, id);
		} else if (L.Browser.touch && (type === 'dblclick') && this.removeDoubleTapListener) {
			this.removeDoubleTapListener(obj, id);

		} else if ('removeEventListener' in obj) {

			if (type === 'mousewheel') {
				obj.removeEventListener('DOMMouseScroll', handler, false);
				obj.removeEventListener(type, handler, false);

			} else if ((type === 'mouseenter') || (type === 'mouseleave')) {
				obj.removeEventListener((type === 'mouseenter' ? 'mouseover' : 'mouseout'), handler, false);
			} else {
				obj.removeEventListener(type, handler, false);
			}
		} else if ('detachEvent' in obj) {
			obj.detachEvent('on' + type, handler);
		}

		obj[key] = null;

		return this;
	},

	stopPropagation: function (e) {

		if (e.stopPropagation) {
			e.stopPropagation();
		} else {
			e.cancelBubble = true;
		}
		L.DomEvent._skipped(e);

		return this;
	},

	disableScrollPropagation: function (el) {
		var stop = L.DomEvent.stopPropagation;

		return L.DomEvent
			.on(el, 'mousewheel', stop)
			.on(el, 'MozMousePixelScroll', stop);
	},

	disableClickPropagation: function (el) {
		var stop = L.DomEvent.stopPropagation;

		for (var i = L.Draggable.START.length - 1; i >= 0; i--) {
			L.DomEvent.on(el, L.Draggable.START[i], stop);
		}

		return L.DomEvent
			.on(el, 'click', L.DomEvent._fakeStop)
			.on(el, 'dblclick', stop);
	},

	preventDefault: function (e) {

		if (e.preventDefault) {
			e.preventDefault();
		} else {
			e.returnValue = false;
		}
		return this;
	},

	stop: function (e) {
		return L.DomEvent
			.preventDefault(e)
			.stopPropagation(e);
	},

	getMousePosition: function (e, container) {
		if (!container) {
			return new L.Point(e.clientX, e.clientY);
		}

		var rect = container.getBoundingClientRect();

		return new L.Point(
			e.clientX - rect.left - container.clientLeft,
			e.clientY - rect.top - container.clientTop);
	},

	getWheelDelta: function (e) {

		var delta = 0;

		if (e.wheelDelta) {
			delta = e.wheelDelta / 120;
		}
		if (e.detail) {
			delta = -e.detail / 3;
		}
		return delta;
	},

	_skipEvents: {},

	_fakeStop: function (e) {
		// fakes stopPropagation by setting a special event flag, checked/reset with L.DomEvent._skipped(e)
		L.DomEvent._skipEvents[e.type] = true;
	},

	_skipped: function (e) {
		var skipped = this._skipEvents[e.type];
		// reset when checking, as it's only used in map container and propagates outside of the map
		this._skipEvents[e.type] = false;
		return skipped;
	},

	// check if element really left/entered the event target (for mouseenter/mouseleave)
	_checkMouse: function (el, e) {

		var related = e.relatedTarget;

		if (!related) { return true; }

		try {
			while (related && (related !== el)) {
				related = related.parentNode;
			}
		} catch (err) {
			return false;
		}
		return (related !== el);
	},

	_getEvent: function () { // evil magic for IE
		/*jshint noarg:false */
		var e = window.event;
		if (!e) {
			var caller = arguments.callee.caller;
			while (caller) {
				e = caller['arguments'][0];
				if (e && window.Event === e.constructor) {
					break;
				}
				caller = caller.caller;
			}
		}
		return e;
	},

	// this is a horrible workaround for a bug in Android where a single touch triggers two click events
	_filterClick: function (e, handler) {
		var timeStamp = (e.timeStamp || e.originalEvent.timeStamp),
			elapsed = L.DomEvent._lastClick && (timeStamp - L.DomEvent._lastClick);

		// are they closer together than 500ms yet more than 100ms?
		// Android typically triggers them ~300ms apart while multiple listeners
		// on the same event should be triggered far faster;
		// or check if click is simulated on the element, and if it is, reject any non-simulated events

		if ((elapsed && elapsed > 100 && elapsed < 500) || (e.target._simulatedClick && !e._simulated)) {
			L.DomEvent.stop(e);
			return;
		}
		L.DomEvent._lastClick = timeStamp;

		return handler(e);
	}
};

L.DomEvent.on = L.DomEvent.addListener;
L.DomEvent.off = L.DomEvent.removeListener;


/*
 * L.Draggable allows you to add dragging capabilities to any element. Supports mobile devices too.
 */

L.Draggable = L.Class.extend({
	includes: L.Mixin.Events,

	statics: {
		START: L.Browser.touch ? ['touchstart', 'mousedown'] : ['mousedown'],
		END: {
			mousedown: 'mouseup',
			touchstart: 'touchend',
			pointerdown: 'touchend',
			MSPointerDown: 'touchend'
		},
		MOVE: {
			mousedown: 'mousemove',
			touchstart: 'touchmove',
			pointerdown: 'touchmove',
			MSPointerDown: 'touchmove'
		}
	},

	initialize: function (element, dragStartTarget) {
		this._element = element;
		this._dragStartTarget = dragStartTarget || element;
	},

	enable: function () {
		if (this._enabled) { return; }

		for (var i = L.Draggable.START.length - 1; i >= 0; i--) {
			L.DomEvent.on(this._dragStartTarget, L.Draggable.START[i], this._onDown, this);
		}

		this._enabled = true;
	},

	disable: function () {
		if (!this._enabled) { return; }

		for (var i = L.Draggable.START.length - 1; i >= 0; i--) {
			L.DomEvent.off(this._dragStartTarget, L.Draggable.START[i], this._onDown, this);
		}

		this._enabled = false;
		this._moved = false;
	},

	_onDown: function (e) {
		this._moved = false;

		if (e.shiftKey || ((e.which !== 1) && (e.button !== 1) && !e.touches)) { return; }

		L.DomEvent.stopPropagation(e);

		if (L.Draggable._disabled) { return; }

		L.DomUtil.disableImageDrag();
		L.DomUtil.disableTextSelection();

		if (this._moving) { return; }

		var first = e.touches ? e.touches[0] : e;

		this._startPoint = new L.Point(first.clientX, first.clientY);
		this._startPos = this._newPos = L.DomUtil.getPosition(this._element);

		L.DomEvent
		    .on(document, L.Draggable.MOVE[e.type], this._onMove, this)
		    .on(document, L.Draggable.END[e.type], this._onUp, this);
	},

	_onMove: function (e) {
		if (e.touches && e.touches.length > 1) {
			this._moved = true;
			return;
		}

		var first = (e.touches && e.touches.length === 1 ? e.touches[0] : e),
		    newPoint = new L.Point(first.clientX, first.clientY),
		    offset = newPoint.subtract(this._startPoint);

		if (!offset.x && !offset.y) { return; }
		if (L.Browser.touch && Math.abs(offset.x) + Math.abs(offset.y) < 3) { return; }

		L.DomEvent.preventDefault(e);

		if (!this._moved) {
			this.fire('dragstart');

			this._moved = true;
			this._startPos = L.DomUtil.getPosition(this._element).subtract(offset);

			L.DomUtil.addClass(document.body, 'leaflet-dragging');
			this._lastTarget = e.target || e.srcElement;
			L.DomUtil.addClass(this._lastTarget, 'leaflet-drag-target');
		}

		this._newPos = this._startPos.add(offset);
		this._moving = true;

		L.Util.cancelAnimFrame(this._animRequest);
		this._animRequest = L.Util.requestAnimFrame(this._updatePosition, this, true, this._dragStartTarget);
	},

	_updatePosition: function () {
		this.fire('predrag');
		L.DomUtil.setPosition(this._element, this._newPos);
		this.fire('drag');
	},

	_onUp: function () {
		L.DomUtil.removeClass(document.body, 'leaflet-dragging');

		if (this._lastTarget) {
			L.DomUtil.removeClass(this._lastTarget, 'leaflet-drag-target');
			this._lastTarget = null;
		}

		for (var i in L.Draggable.MOVE) {
			L.DomEvent
			    .off(document, L.Draggable.MOVE[i], this._onMove)
			    .off(document, L.Draggable.END[i], this._onUp);
		}

		L.DomUtil.enableImageDrag();
		L.DomUtil.enableTextSelection();

		if (this._moved && this._moving) {
			// ensure drag is not fired after dragend
			L.Util.cancelAnimFrame(this._animRequest);

			this.fire('dragend', {
				distance: this._newPos.distanceTo(this._startPos)
			});
		}

		this._moving = false;
	}
});


/*
	L.Handler is a base class for handler classes that are used internally to inject
	interaction features like dragging to classes like Map and Marker.
*/

L.Handler = L.Class.extend({
	initialize: function (map) {
		this._map = map;
	},

	enable: function () {
		if (this._enabled) { return; }

		this._enabled = true;
		this.addHooks();
	},

	disable: function () {
		if (!this._enabled) { return; }

		this._enabled = false;
		this.removeHooks();
	},

	enabled: function () {
		return !!this._enabled;
	}
});


/*
 * L.Handler.MapDrag is used to make the map draggable (with panning inertia), enabled by default.
 */

L.Map.mergeOptions({
	dragging: true,

	inertia: !L.Browser.android23,
	inertiaDeceleration: 3400, // px/s^2
	inertiaMaxSpeed: Infinity, // px/s
	inertiaThreshold: L.Browser.touch ? 32 : 18, // ms
	easeLinearity: 0.25,

	// TODO refactor, move to CRS
	worldCopyJump: false
});

L.Map.Drag = L.Handler.extend({
	addHooks: function () {
		if (!this._draggable) {
			var map = this._map;

			this._draggable = new L.Draggable(map._mapPane, map._container);

			this._draggable.on({
				'dragstart': this._onDragStart,
				'drag': this._onDrag,
				'dragend': this._onDragEnd
			}, this);

			if (map.options.worldCopyJump) {
				this._draggable.on('predrag', this._onPreDrag, this);
				map.on('viewreset', this._onViewReset, this);

				map.whenReady(this._onViewReset, this);
			}
		}
		this._draggable.enable();
	},

	removeHooks: function () {
		this._draggable.disable();
	},

	moved: function () {
		return this._draggable && this._draggable._moved;
	},

	_onDragStart: function () {
		var map = this._map;

		if (map._panAnim) {
			map._panAnim.stop();
		}

		map
		    .fire('movestart')
		    .fire('dragstart');

		if (map.options.inertia) {
			this._positions = [];
			this._times = [];
		}
	},

	_onDrag: function () {
		if (this._map.options.inertia) {
			var time = this._lastTime = +new Date(),
			    pos = this._lastPos = this._draggable._newPos;

			this._positions.push(pos);
			this._times.push(time);

			if (time - this._times[0] > 200) {
				this._positions.shift();
				this._times.shift();
			}
		}

		this._map
		    .fire('move')
		    .fire('drag');
	},

	_onViewReset: function () {
		// TODO fix hardcoded Earth values
		var pxCenter = this._map.getSize()._divideBy(2),
		    pxWorldCenter = this._map.latLngToLayerPoint([0, 0]);

		this._initialWorldOffset = pxWorldCenter.subtract(pxCenter).x;
		this._worldWidth = this._map.project([0, 180]).x;
	},

	_onPreDrag: function () {
		// TODO refactor to be able to adjust map pane position after zoom
		var worldWidth = this._worldWidth,
		    halfWidth = Math.round(worldWidth / 2),
		    dx = this._initialWorldOffset,
		    x = this._draggable._newPos.x,
		    newX1 = (x - halfWidth + dx) % worldWidth + halfWidth - dx,
		    newX2 = (x + halfWidth + dx) % worldWidth - halfWidth - dx,
		    newX = Math.abs(newX1 + dx) < Math.abs(newX2 + dx) ? newX1 : newX2;

		this._draggable._newPos.x = newX;
	},

	_onDragEnd: function (e) {
		var map = this._map,
		    options = map.options,
		    delay = +new Date() - this._lastTime,

		    noInertia = !options.inertia || delay > options.inertiaThreshold || !this._positions[0];

		map.fire('dragend', e);

		if (noInertia) {
			map.fire('moveend');

		} else {

			var direction = this._lastPos.subtract(this._positions[0]),
			    duration = (this._lastTime + delay - this._times[0]) / 1000,
			    ease = options.easeLinearity,

			    speedVector = direction.multiplyBy(ease / duration),
			    speed = speedVector.distanceTo([0, 0]),

			    limitedSpeed = Math.min(options.inertiaMaxSpeed, speed),
			    limitedSpeedVector = speedVector.multiplyBy(limitedSpeed / speed),

			    decelerationDuration = limitedSpeed / (options.inertiaDeceleration * ease),
			    offset = limitedSpeedVector.multiplyBy(-decelerationDuration / 2).round();

			if (!offset.x || !offset.y) {
				map.fire('moveend');

			} else {
				offset = map._limitOffset(offset, map.options.maxBounds);

				L.Util.requestAnimFrame(function () {
					map.panBy(offset, {
						duration: decelerationDuration,
						easeLinearity: ease,
						noMoveStart: true
					});
				});
			}
		}
	}
});

L.Map.addInitHook('addHandler', 'dragging', L.Map.Drag);


/*
 * L.Handler.DoubleClickZoom is used to handle double-click zoom on the map, enabled by default.
 */

L.Map.mergeOptions({
	doubleClickZoom: true
});

L.Map.DoubleClickZoom = L.Handler.extend({
	addHooks: function () {
		this._map.on('dblclick', this._onDoubleClick, this);
	},

	removeHooks: function () {
		this._map.off('dblclick', this._onDoubleClick, this);
	},

	_onDoubleClick: function (e) {
		var map = this._map,
		    zoom = map.getZoom() + (e.originalEvent.shiftKey ? -1 : 1);

		if (map.options.doubleClickZoom === 'center') {
			map.setZoom(zoom);
		} else {
			map.setZoomAround(e.containerPoint, zoom);
		}
	}
});

L.Map.addInitHook('addHandler', 'doubleClickZoom', L.Map.DoubleClickZoom);


/*
 * L.Handler.ScrollWheelZoom is used by L.Map to enable mouse scroll wheel zoom on the map.
 */

L.Map.mergeOptions({
	scrollWheelZoom: true
});

L.Map.ScrollWheelZoom = L.Handler.extend({
	addHooks: function () {
		L.DomEvent.on(this._map._container, 'mousewheel', this._onWheelScroll, this);
		L.DomEvent.on(this._map._container, 'MozMousePixelScroll', L.DomEvent.preventDefault);
		this._delta = 0;
	},

	removeHooks: function () {
		L.DomEvent.off(this._map._container, 'mousewheel', this._onWheelScroll);
		L.DomEvent.off(this._map._container, 'MozMousePixelScroll', L.DomEvent.preventDefault);
	},

	_onWheelScroll: function (e) {
		var delta = L.DomEvent.getWheelDelta(e);

		this._delta += delta;
		this._lastMousePos = this._map.mouseEventToContainerPoint(e);

		if (!this._startTime) {
			this._startTime = +new Date();
		}

		var left = Math.max(40 - (+new Date() - this._startTime), 0);

		clearTimeout(this._timer);
		this._timer = setTimeout(L.bind(this._performZoom, this), left);

		L.DomEvent.preventDefault(e);
		L.DomEvent.stopPropagation(e);
	},

	_performZoom: function () {
		var map = this._map,
		    delta = this._delta,
		    zoom = map.getZoom();

		delta = delta > 0 ? Math.ceil(delta) : Math.floor(delta);
		delta = Math.max(Math.min(delta, 4), -4);
		delta = map._limitZoom(zoom + delta) - zoom;

		this._delta = 0;
		this._startTime = null;

		if (!delta) { return; }

		if (map.options.scrollWheelZoom === 'center') {
			map.setZoom(zoom + delta);
		} else {
			map.setZoomAround(this._lastMousePos, zoom + delta);
		}
	}
});

L.Map.addInitHook('addHandler', 'scrollWheelZoom', L.Map.ScrollWheelZoom);


/*
 * Extends the event handling code with double tap support for mobile browsers.
 */

L.extend(L.DomEvent, {

	_touchstart: L.Browser.msPointer ? 'MSPointerDown' : L.Browser.pointer ? 'pointerdown' : 'touchstart',
	_touchend: L.Browser.msPointer ? 'MSPointerUp' : L.Browser.pointer ? 'pointerup' : 'touchend',

	// inspired by Zepto touch code by Thomas Fuchs
	addDoubleTapListener: function (obj, handler, id) {
		var last,
		    doubleTap = false,
		    delay = 250,
		    touch,
		    pre = '_leaflet_',
		    touchstart = this._touchstart,
		    touchend = this._touchend,
		    trackedTouches = [];

		function onTouchStart(e) {
			var count;

			if (L.Browser.pointer) {
				trackedTouches.push(e.pointerId);
				count = trackedTouches.length;
			} else {
				count = e.touches.length;
			}
			if (count > 1) {
				return;
			}

			var now = Date.now(),
				delta = now - (last || now);

			touch = e.touches ? e.touches[0] : e;
			doubleTap = (delta > 0 && delta <= delay);
			last = now;
		}

		function onTouchEnd(e) {
			if (L.Browser.pointer) {
				var idx = trackedTouches.indexOf(e.pointerId);
				if (idx === -1) {
					return;
				}
				trackedTouches.splice(idx, 1);
			}

			if (doubleTap) {
				if (L.Browser.pointer) {
					// work around .type being readonly with MSPointer* events
					var newTouch = { },
						prop;

					// jshint forin:false
					for (var i in touch) {
						prop = touch[i];
						if (typeof prop === 'function') {
							newTouch[i] = prop.bind(touch);
						} else {
							newTouch[i] = prop;
						}
					}
					touch = newTouch;
				}
				touch.type = 'dblclick';
				handler(touch);
				last = null;
			}
		}
		obj[pre + touchstart + id] = onTouchStart;
		obj[pre + touchend + id] = onTouchEnd;

		// on pointer we need to listen on the document, otherwise a drag starting on the map and moving off screen
		// will not come through to us, so we will lose track of how many touches are ongoing
		var endElement = L.Browser.pointer ? document.documentElement : obj;

		obj.addEventListener(touchstart, onTouchStart, false);
		endElement.addEventListener(touchend, onTouchEnd, false);

		if (L.Browser.pointer) {
			endElement.addEventListener(L.DomEvent.POINTER_CANCEL, onTouchEnd, false);
		}

		return this;
	},

	removeDoubleTapListener: function (obj, id) {
		var pre = '_leaflet_';

		obj.removeEventListener(this._touchstart, obj[pre + this._touchstart + id], false);
		(L.Browser.pointer ? document.documentElement : obj).removeEventListener(
		        this._touchend, obj[pre + this._touchend + id], false);

		if (L.Browser.pointer) {
			document.documentElement.removeEventListener(L.DomEvent.POINTER_CANCEL, obj[pre + this._touchend + id],
				false);
		}

		return this;
	}
});


/*
 * Extends L.DomEvent to provide touch support for Internet Explorer and Windows-based devices.
 */

L.extend(L.DomEvent, {

	//static
	POINTER_DOWN: L.Browser.msPointer ? 'MSPointerDown' : 'pointerdown',
	POINTER_MOVE: L.Browser.msPointer ? 'MSPointerMove' : 'pointermove',
	POINTER_UP: L.Browser.msPointer ? 'MSPointerUp' : 'pointerup',
	POINTER_CANCEL: L.Browser.msPointer ? 'MSPointerCancel' : 'pointercancel',

	_pointers: [],
	_pointerDocumentListener: false,

	// Provides a touch events wrapper for (ms)pointer events.
	// Based on changes by veproza https://github.com/CloudMade/Leaflet/pull/1019
	//ref http://www.w3.org/TR/pointerevents/ https://www.w3.org/Bugs/Public/show_bug.cgi?id=22890

	addPointerListener: function (obj, type, handler, id) {

		switch (type) {
		case 'touchstart':
			return this.addPointerListenerStart(obj, type, handler, id);
		case 'touchend':
			return this.addPointerListenerEnd(obj, type, handler, id);
		case 'touchmove':
			return this.addPointerListenerMove(obj, type, handler, id);
		default:
			throw 'Unknown touch event type';
		}
	},

	addPointerListenerStart: function (obj, type, handler, id) {
		var pre = '_leaflet_',
		    pointers = this._pointers;

		var cb = function (e) {

			L.DomEvent.preventDefault(e);

			var alreadyInArray = false;
			for (var i = 0; i < pointers.length; i++) {
				if (pointers[i].pointerId === e.pointerId) {
					alreadyInArray = true;
					break;
				}
			}
			if (!alreadyInArray) {
				pointers.push(e);
			}

			e.touches = pointers.slice();
			e.changedTouches = [e];

			handler(e);
		};

		obj[pre + 'touchstart' + id] = cb;
		obj.addEventListener(this.POINTER_DOWN, cb, false);

		// need to also listen for end events to keep the _pointers list accurate
		// this needs to be on the body and never go away
		if (!this._pointerDocumentListener) {
			var internalCb = function (e) {
				for (var i = 0; i < pointers.length; i++) {
					if (pointers[i].pointerId === e.pointerId) {
						pointers.splice(i, 1);
						break;
					}
				}
			};
			//We listen on the documentElement as any drags that end by moving the touch off the screen get fired there
			document.documentElement.addEventListener(this.POINTER_UP, internalCb, false);
			document.documentElement.addEventListener(this.POINTER_CANCEL, internalCb, false);

			this._pointerDocumentListener = true;
		}

		return this;
	},

	addPointerListenerMove: function (obj, type, handler, id) {
		var pre = '_leaflet_',
		    touches = this._pointers;

		function cb(e) {

			// don't fire touch moves when mouse isn't down
			if ((e.pointerType === e.MSPOINTER_TYPE_MOUSE || e.pointerType === 'mouse') && e.buttons === 0) { return; }

			for (var i = 0; i < touches.length; i++) {
				if (touches[i].pointerId === e.pointerId) {
					touches[i] = e;
					break;
				}
			}

			e.touches = touches.slice();
			e.changedTouches = [e];

			handler(e);
		}

		obj[pre + 'touchmove' + id] = cb;
		obj.addEventListener(this.POINTER_MOVE, cb, false);

		return this;
	},

	addPointerListenerEnd: function (obj, type, handler, id) {
		var pre = '_leaflet_',
		    touches = this._pointers;

		var cb = function (e) {
			for (var i = 0; i < touches.length; i++) {
				if (touches[i].pointerId === e.pointerId) {
					touches.splice(i, 1);
					break;
				}
			}

			e.touches = touches.slice();
			e.changedTouches = [e];

			handler(e);
		};

		obj[pre + 'touchend' + id] = cb;
		obj.addEventListener(this.POINTER_UP, cb, false);
		obj.addEventListener(this.POINTER_CANCEL, cb, false);

		return this;
	},

	removePointerListener: function (obj, type, id) {
		var pre = '_leaflet_',
		    cb = obj[pre + type + id];

		switch (type) {
		case 'touchstart':
			obj.removeEventListener(this.POINTER_DOWN, cb, false);
			break;
		case 'touchmove':
			obj.removeEventListener(this.POINTER_MOVE, cb, false);
			break;
		case 'touchend':
			obj.removeEventListener(this.POINTER_UP, cb, false);
			obj.removeEventListener(this.POINTER_CANCEL, cb, false);
			break;
		}

		return this;
	}
});


/*
 * L.Handler.TouchZoom is used by L.Map to add pinch zoom on supported mobile browsers.
 */

L.Map.mergeOptions({
	touchZoom: L.Browser.touch && !L.Browser.android23,
	bounceAtZoomLimits: true
});

L.Map.TouchZoom = L.Handler.extend({
	addHooks: function () {
		L.DomEvent.on(this._map._container, 'touchstart', this._onTouchStart, this);
	},

	removeHooks: function () {
		L.DomEvent.off(this._map._container, 'touchstart', this._onTouchStart, this);
	},

	_onTouchStart: function (e) {
		var map = this._map;

		if (!e.touches || e.touches.length !== 2 || map._animatingZoom || this._zooming) { return; }

		var p1 = map.mouseEventToLayerPoint(e.touches[0]),
		    p2 = map.mouseEventToLayerPoint(e.touches[1]),
		    viewCenter = map._getCenterLayerPoint();

		this._startCenter = p1.add(p2)._divideBy(2);
		this._startDist = p1.distanceTo(p2);

		this._moved = false;
		this._zooming = true;

		this._centerOffset = viewCenter.subtract(this._startCenter);

		if (map._panAnim) {
			map._panAnim.stop();
		}

		L.DomEvent
		    .on(document, 'touchmove', this._onTouchMove, this)
		    .on(document, 'touchend', this._onTouchEnd, this);

		L.DomEvent.preventDefault(e);
	},

	_onTouchMove: function (e) {
		var map = this._map;

		if (!e.touches || e.touches.length !== 2 || !this._zooming) { return; }

		var p1 = map.mouseEventToLayerPoint(e.touches[0]),
		    p2 = map.mouseEventToLayerPoint(e.touches[1]);

		this._scale = p1.distanceTo(p2) / this._startDist;
		this._delta = p1._add(p2)._divideBy(2)._subtract(this._startCenter);

		if (this._scale === 1) { return; }

		if (!map.options.bounceAtZoomLimits) {
			if ((map.getZoom() === map.getMinZoom() && this._scale < 1) ||
			    (map.getZoom() === map.getMaxZoom() && this._scale > 1)) { return; }
		}

		if (!this._moved) {
			L.DomUtil.addClass(map._mapPane, 'leaflet-touching');

			map
			    .fire('movestart')
			    .fire('zoomstart');

			this._moved = true;
		}

		L.Util.cancelAnimFrame(this._animRequest);
		this._animRequest = L.Util.requestAnimFrame(
		        this._updateOnMove, this, true, this._map._container);

		L.DomEvent.preventDefault(e);
	},

	_updateOnMove: function () {
		var map = this._map,
		    origin = this._getScaleOrigin(),
		    center = map.layerPointToLatLng(origin),
		    zoom = map.getScaleZoom(this._scale);

		map._animateZoom(center, zoom, this._startCenter, this._scale, this._delta, false, true);
	},

	_onTouchEnd: function () {
		if (!this._moved || !this._zooming) {
			this._zooming = false;
			return;
		}

		var map = this._map;

		this._zooming = false;
		L.DomUtil.removeClass(map._mapPane, 'leaflet-touching');
		L.Util.cancelAnimFrame(this._animRequest);

		L.DomEvent
		    .off(document, 'touchmove', this._onTouchMove)
		    .off(document, 'touchend', this._onTouchEnd);

		var origin = this._getScaleOrigin(),
		    center = map.layerPointToLatLng(origin),

		    oldZoom = map.getZoom(),
		    floatZoomDelta = map.getScaleZoom(this._scale) - oldZoom,
		    roundZoomDelta = (floatZoomDelta > 0 ?
		            Math.ceil(floatZoomDelta) : Math.floor(floatZoomDelta)),

		    zoom = map._limitZoom(oldZoom + roundZoomDelta),
		    scale = map.getZoomScale(zoom) / this._scale;

		map._animateZoom(center, zoom, origin, scale);
	},

	_getScaleOrigin: function () {
		var centerOffset = this._centerOffset.subtract(this._delta).divideBy(this._scale);
		return this._startCenter.add(centerOffset);
	}
});

L.Map.addInitHook('addHandler', 'touchZoom', L.Map.TouchZoom);


/*
 * L.Map.Tap is used to enable mobile hacks like quick taps and long hold.
 */

L.Map.mergeOptions({
	tap: true,
	tapTolerance: 15
});

L.Map.Tap = L.Handler.extend({
	addHooks: function () {
		L.DomEvent.on(this._map._container, 'touchstart', this._onDown, this);
	},

	removeHooks: function () {
		L.DomEvent.off(this._map._container, 'touchstart', this._onDown, this);
	},

	_onDown: function (e) {
		if (!e.touches) { return; }

		L.DomEvent.preventDefault(e);

		this._fireClick = true;

		// don't simulate click or track longpress if more than 1 touch
		if (e.touches.length > 1) {
			this._fireClick = false;
			clearTimeout(this._holdTimeout);
			return;
		}

		var first = e.touches[0],
		    el = first.target;

		this._startPos = this._newPos = new L.Point(first.clientX, first.clientY);

		// if touching a link, highlight it
		if (el.tagName && el.tagName.toLowerCase() === 'a') {
			L.DomUtil.addClass(el, 'leaflet-active');
		}

		// simulate long hold but setting a timeout
		this._holdTimeout = setTimeout(L.bind(function () {
			if (this._isTapValid()) {
				this._fireClick = false;
				this._onUp();
				this._simulateEvent('contextmenu', first);
			}
		}, this), 1000);

		L.DomEvent
			.on(document, 'touchmove', this._onMove, this)
			.on(document, 'touchend', this._onUp, this);
	},

	_onUp: function (e) {
		clearTimeout(this._holdTimeout);

		L.DomEvent
			.off(document, 'touchmove', this._onMove, this)
			.off(document, 'touchend', this._onUp, this);

		if (this._fireClick && e && e.changedTouches) {

			var first = e.changedTouches[0],
			    el = first.target;

			if (el && el.tagName && el.tagName.toLowerCase() === 'a') {
				L.DomUtil.removeClass(el, 'leaflet-active');
			}

			// simulate click if the touch didn't move too much
			if (this._isTapValid()) {
				this._simulateEvent('click', first);
			}
		}
	},

	_isTapValid: function () {
		return this._newPos.distanceTo(this._startPos) <= this._map.options.tapTolerance;
	},

	_onMove: function (e) {
		var first = e.touches[0];
		this._newPos = new L.Point(first.clientX, first.clientY);
	},

	_simulateEvent: function (type, e) {
		var simulatedEvent = document.createEvent('MouseEvents');

		simulatedEvent._simulated = true;
		e.target._simulatedClick = true;

		simulatedEvent.initMouseEvent(
		        type, true, true, window, 1,
		        e.screenX, e.screenY,
		        e.clientX, e.clientY,
		        false, false, false, false, 0, null);

		e.target.dispatchEvent(simulatedEvent);
	}
});

if (L.Browser.touch && !L.Browser.pointer) {
	L.Map.addInitHook('addHandler', 'tap', L.Map.Tap);
}


/*
 * L.Handler.ShiftDragZoom is used to add shift-drag zoom interaction to the map
  * (zoom to a selected bounding box), enabled by default.
 */

L.Map.mergeOptions({
	boxZoom: true
});

L.Map.BoxZoom = L.Handler.extend({
	initialize: function (map) {
		this._map = map;
		this._container = map._container;
		this._pane = map._panes.overlayPane;
		this._moved = false;
	},

	addHooks: function () {
		L.DomEvent.on(this._container, 'mousedown', this._onMouseDown, this);
	},

	removeHooks: function () {
		L.DomEvent.off(this._container, 'mousedown', this._onMouseDown);
		this._moved = false;
	},

	moved: function () {
		return this._moved;
	},

	_onMouseDown: function (e) {
		this._moved = false;

		if (!e.shiftKey || ((e.which !== 1) && (e.button !== 1))) { return false; }

		L.DomUtil.disableTextSelection();
		L.DomUtil.disableImageDrag();

		this._startLayerPoint = this._map.mouseEventToLayerPoint(e);

		L.DomEvent
		    .on(document, 'mousemove', this._onMouseMove, this)
		    .on(document, 'mouseup', this._onMouseUp, this)
		    .on(document, 'keydown', this._onKeyDown, this);
	},

	_onMouseMove: function (e) {
		if (!this._moved) {
			this._box = L.DomUtil.create('div', 'leaflet-zoom-box', this._pane);
			L.DomUtil.setPosition(this._box, this._startLayerPoint);

			//TODO refactor: move cursor to styles
			this._container.style.cursor = 'crosshair';
			this._map.fire('boxzoomstart');
		}

		var startPoint = this._startLayerPoint,
		    box = this._box,

		    layerPoint = this._map.mouseEventToLayerPoint(e),
		    offset = layerPoint.subtract(startPoint),

		    newPos = new L.Point(
		        Math.min(layerPoint.x, startPoint.x),
		        Math.min(layerPoint.y, startPoint.y));

		L.DomUtil.setPosition(box, newPos);

		this._moved = true;

		// TODO refactor: remove hardcoded 4 pixels
		box.style.width  = (Math.max(0, Math.abs(offset.x) - 4)) + 'px';
		box.style.height = (Math.max(0, Math.abs(offset.y) - 4)) + 'px';
	},

	_finish: function () {
		if (this._moved) {
			this._pane.removeChild(this._box);
			this._container.style.cursor = '';
		}

		L.DomUtil.enableTextSelection();
		L.DomUtil.enableImageDrag();

		L.DomEvent
		    .off(document, 'mousemove', this._onMouseMove)
		    .off(document, 'mouseup', this._onMouseUp)
		    .off(document, 'keydown', this._onKeyDown);
	},

	_onMouseUp: function (e) {

		this._finish();

		var map = this._map,
		    layerPoint = map.mouseEventToLayerPoint(e);

		if (this._startLayerPoint.equals(layerPoint)) { return; }

		var bounds = new L.LatLngBounds(
		        map.layerPointToLatLng(this._startLayerPoint),
		        map.layerPointToLatLng(layerPoint));

		map.fitBounds(bounds);

		map.fire('boxzoomend', {
			boxZoomBounds: bounds
		});
	},

	_onKeyDown: function (e) {
		if (e.keyCode === 27) {
			this._finish();
		}
	}
});

L.Map.addInitHook('addHandler', 'boxZoom', L.Map.BoxZoom);


/*
 * L.Map.Keyboard is handling keyboard interaction with the map, enabled by default.
 */

L.Map.mergeOptions({
	keyboard: true,
	keyboardPanOffset: 80,
	keyboardZoomOffset: 1
});

L.Map.Keyboard = L.Handler.extend({

	keyCodes: {
		left:    [37],
		right:   [39],
		down:    [40],
		up:      [38],
		zoomIn:  [187, 107, 61, 171],
		zoomOut: [189, 109, 173]
	},

	initialize: function (map) {
		this._map = map;

		this._setPanOffset(map.options.keyboardPanOffset);
		this._setZoomOffset(map.options.keyboardZoomOffset);
	},

	addHooks: function () {
		var container = this._map._container;

		// make the container focusable by tabbing
		if (container.tabIndex === -1) {
			container.tabIndex = '0';
		}

		L.DomEvent
		    .on(container, 'focus', this._onFocus, this)
		    .on(container, 'blur', this._onBlur, this)
		    .on(container, 'mousedown', this._onMouseDown, this);

		this._map
		    .on('focus', this._addHooks, this)
		    .on('blur', this._removeHooks, this);
	},

	removeHooks: function () {
		this._removeHooks();

		var container = this._map._container;

		L.DomEvent
		    .off(container, 'focus', this._onFocus, this)
		    .off(container, 'blur', this._onBlur, this)
		    .off(container, 'mousedown', this._onMouseDown, this);

		this._map
		    .off('focus', this._addHooks, this)
		    .off('blur', this._removeHooks, this);
	},

	_onMouseDown: function () {
		if (this._focused) { return; }

		var body = document.body,
		    docEl = document.documentElement,
		    top = body.scrollTop || docEl.scrollTop,
		    left = body.scrollLeft || docEl.scrollLeft;

		this._map._container.focus();

		window.scrollTo(left, top);
	},

	_onFocus: function () {
		this._focused = true;
		this._map.fire('focus');
	},

	_onBlur: function () {
		this._focused = false;
		this._map.fire('blur');
	},

	_setPanOffset: function (pan) {
		var keys = this._panKeys = {},
		    codes = this.keyCodes,
		    i, len;

		for (i = 0, len = codes.left.length; i < len; i++) {
			keys[codes.left[i]] = [-1 * pan, 0];
		}
		for (i = 0, len = codes.right.length; i < len; i++) {
			keys[codes.right[i]] = [pan, 0];
		}
		for (i = 0, len = codes.down.length; i < len; i++) {
			keys[codes.down[i]] = [0, pan];
		}
		for (i = 0, len = codes.up.length; i < len; i++) {
			keys[codes.up[i]] = [0, -1 * pan];
		}
	},

	_setZoomOffset: function (zoom) {
		var keys = this._zoomKeys = {},
		    codes = this.keyCodes,
		    i, len;

		for (i = 0, len = codes.zoomIn.length; i < len; i++) {
			keys[codes.zoomIn[i]] = zoom;
		}
		for (i = 0, len = codes.zoomOut.length; i < len; i++) {
			keys[codes.zoomOut[i]] = -zoom;
		}
	},

	_addHooks: function () {
		L.DomEvent.on(document, 'keydown', this._onKeyDown, this);
	},

	_removeHooks: function () {
		L.DomEvent.off(document, 'keydown', this._onKeyDown, this);
	},

	_onKeyDown: function (e) {
		var key = e.keyCode,
		    map = this._map;

		if (key in this._panKeys) {

			if (map._panAnim && map._panAnim._inProgress) { return; }

			map.panBy(this._panKeys[key]);

			if (map.options.maxBounds) {
				map.panInsideBounds(map.options.maxBounds);
			}

		} else if (key in this._zoomKeys) {
			map.setZoom(map.getZoom() + this._zoomKeys[key]);

		} else {
			return;
		}

		L.DomEvent.stop(e);
	}
});

L.Map.addInitHook('addHandler', 'keyboard', L.Map.Keyboard);


/*
 * L.Handler.MarkerDrag is used internally by L.Marker to make the markers draggable.
 */

L.Handler.MarkerDrag = L.Handler.extend({
	initialize: function (marker) {
		this._marker = marker;
	},

	addHooks: function () {
		var icon = this._marker._icon;
		if (!this._draggable) {
			this._draggable = new L.Draggable(icon, icon);
		}

		this._draggable
			.on('dragstart', this._onDragStart, this)
			.on('drag', this._onDrag, this)
			.on('dragend', this._onDragEnd, this);
		this._draggable.enable();
		L.DomUtil.addClass(this._marker._icon, 'leaflet-marker-draggable');
	},

	removeHooks: function () {
		this._draggable
			.off('dragstart', this._onDragStart, this)
			.off('drag', this._onDrag, this)
			.off('dragend', this._onDragEnd, this);

		this._draggable.disable();
		L.DomUtil.removeClass(this._marker._icon, 'leaflet-marker-draggable');
	},

	moved: function () {
		return this._draggable && this._draggable._moved;
	},

	_onDragStart: function () {
		this._marker
		    .closePopup()
		    .fire('movestart')
		    .fire('dragstart');
	},

	_onDrag: function () {
		var marker = this._marker,
		    shadow = marker._shadow,
		    iconPos = L.DomUtil.getPosition(marker._icon),
		    latlng = marker._map.layerPointToLatLng(iconPos);

		// update shadow position
		if (shadow) {
			L.DomUtil.setPosition(shadow, iconPos);
		}

		marker._latlng = latlng;

		marker
		    .fire('move', {latlng: latlng})
		    .fire('drag');
	},

	_onDragEnd: function (e) {
		this._marker
		    .fire('moveend')
		    .fire('dragend', e);
	}
});


/*
 * L.Control is a base class for implementing map controls. Handles positioning.
 * All other controls extend from this class.
 */

L.Control = L.Class.extend({
	options: {
		position: 'topright'
	},

	initialize: function (options) {
		L.setOptions(this, options);
	},

	getPosition: function () {
		return this.options.position;
	},

	setPosition: function (position) {
		var map = this._map;

		if (map) {
			map.removeControl(this);
		}

		this.options.position = position;

		if (map) {
			map.addControl(this);
		}

		return this;
	},

	getContainer: function () {
		return this._container;
	},

	addTo: function (map) {
		this._map = map;

		var container = this._container = this.onAdd(map),
		    pos = this.getPosition(),
		    corner = map._controlCorners[pos];

		L.DomUtil.addClass(container, 'leaflet-control');

		if (pos.indexOf('bottom') !== -1) {
			corner.insertBefore(container, corner.firstChild);
		} else {
			corner.appendChild(container);
		}

		return this;
	},

	removeFrom: function (map) {
		var pos = this.getPosition(),
		    corner = map._controlCorners[pos];

		corner.removeChild(this._container);
		this._map = null;

		if (this.onRemove) {
			this.onRemove(map);
		}

		return this;
	},

	_refocusOnMap: function () {
		if (this._map) {
			this._map.getContainer().focus();
		}
	}
});

L.control = function (options) {
	return new L.Control(options);
};


// adds control-related methods to L.Map

L.Map.include({
	addControl: function (control) {
		control.addTo(this);
		return this;
	},

	removeControl: function (control) {
		control.removeFrom(this);
		return this;
	},

	_initControlPos: function () {
		var corners = this._controlCorners = {},
		    l = 'leaflet-',
		    container = this._controlContainer =
		            L.DomUtil.create('div', l + 'control-container', this._container);

		function createCorner(vSide, hSide) {
			var className = l + vSide + ' ' + l + hSide;

			corners[vSide + hSide] = L.DomUtil.create('div', className, container);
		}

		createCorner('top', 'left');
		createCorner('top', 'right');
		createCorner('bottom', 'left');
		createCorner('bottom', 'right');
	},

	_clearControlPos: function () {
		this._container.removeChild(this._controlContainer);
	}
});


/*
 * L.Control.Zoom is used for the default zoom buttons on the map.
 */

L.Control.Zoom = L.Control.extend({
	options: {
		position: 'topleft',
		zoomInText: '+',
		zoomInTitle: 'Zoom in',
		zoomOutText: '-',
		zoomOutTitle: 'Zoom out'
	},

	onAdd: function (map) {
		var zoomName = 'leaflet-control-zoom',
		    container = L.DomUtil.create('div', zoomName + ' leaflet-bar');

		this._map = map;

		this._zoomInButton  = this._createButton(
		        this.options.zoomInText, this.options.zoomInTitle,
		        zoomName + '-in',  container, this._zoomIn,  this);
		this._zoomOutButton = this._createButton(
		        this.options.zoomOutText, this.options.zoomOutTitle,
		        zoomName + '-out', container, this._zoomOut, this);

		this._updateDisabled();
		map.on('zoomend zoomlevelschange', this._updateDisabled, this);

		return container;
	},

	onRemove: function (map) {
		map.off('zoomend zoomlevelschange', this._updateDisabled, this);
	},

	_zoomIn: function (e) {
		this._map.zoomIn(e.shiftKey ? 3 : 1);
	},

	_zoomOut: function (e) {
		this._map.zoomOut(e.shiftKey ? 3 : 1);
	},

	_createButton: function (html, title, className, container, fn, context) {
		var link = L.DomUtil.create('a', className, container);
		link.innerHTML = html;
		link.href = '#';
		link.title = title;

		var stop = L.DomEvent.stopPropagation;

		L.DomEvent
		    .on(link, 'click', stop)
		    .on(link, 'mousedown', stop)
		    .on(link, 'dblclick', stop)
		    .on(link, 'click', L.DomEvent.preventDefault)
		    .on(link, 'click', fn, context)
		    .on(link, 'click', this._refocusOnMap, context);

		return link;
	},

	_updateDisabled: function () {
		var map = this._map,
			className = 'leaflet-disabled';

		L.DomUtil.removeClass(this._zoomInButton, className);
		L.DomUtil.removeClass(this._zoomOutButton, className);

		if (map._zoom === map.getMinZoom()) {
			L.DomUtil.addClass(this._zoomOutButton, className);
		}
		if (map._zoom === map.getMaxZoom()) {
			L.DomUtil.addClass(this._zoomInButton, className);
		}
	}
});

L.Map.mergeOptions({
	zoomControl: true
});

L.Map.addInitHook(function () {
	if (this.options.zoomControl) {
		this.zoomControl = new L.Control.Zoom();
		this.addControl(this.zoomControl);
	}
});

L.control.zoom = function (options) {
	return new L.Control.Zoom(options);
};



/*
 * L.Control.Attribution is used for displaying attribution on the map (added by default).
 */

L.Control.Attribution = L.Control.extend({
	options: {
		position: 'bottomright',
		prefix: '<a href="http://leafletjs.com" title="A JS library for interactive maps">Leaflet</a>'
	},

	initialize: function (options) {
		L.setOptions(this, options);

		this._attributions = {};
	},

	onAdd: function (map) {
		this._container = L.DomUtil.create('div', 'leaflet-control-attribution');
		L.DomEvent.disableClickPropagation(this._container);

		for (var i in map._layers) {
			if (map._layers[i].getAttribution) {
				this.addAttribution(map._layers[i].getAttribution());
			}
		}
		
		map
		    .on('layeradd', this._onLayerAdd, this)
		    .on('layerremove', this._onLayerRemove, this);

		this._update();

		return this._container;
	},

	onRemove: function (map) {
		map
		    .off('layeradd', this._onLayerAdd)
		    .off('layerremove', this._onLayerRemove);

	},

	setPrefix: function (prefix) {
		this.options.prefix = prefix;
		this._update();
		return this;
	},

	addAttribution: function (text) {
		if (!text) { return; }

		if (!this._attributions[text]) {
			this._attributions[text] = 0;
		}
		this._attributions[text]++;

		this._update();

		return this;
	},

	removeAttribution: function (text) {
		if (!text) { return; }

		if (this._attributions[text]) {
			this._attributions[text]--;
			this._update();
		}

		return this;
	},

	_update: function () {
		if (!this._map) { return; }

		var attribs = [];

		for (var i in this._attributions) {
			if (this._attributions[i]) {
				attribs.push(i);
			}
		}

		var prefixAndAttribs = [];

		if (this.options.prefix) {
			prefixAndAttribs.push(this.options.prefix);
		}
		if (attribs.length) {
			prefixAndAttribs.push(attribs.join(', '));
		}

		this._container.innerHTML = prefixAndAttribs.join(' | ');
	},

	_onLayerAdd: function (e) {
		if (e.layer.getAttribution) {
			this.addAttribution(e.layer.getAttribution());
		}
	},

	_onLayerRemove: function (e) {
		if (e.layer.getAttribution) {
			this.removeAttribution(e.layer.getAttribution());
		}
	}
});

L.Map.mergeOptions({
	attributionControl: true
});

L.Map.addInitHook(function () {
	if (this.options.attributionControl) {
		this.attributionControl = (new L.Control.Attribution()).addTo(this);
	}
});

L.control.attribution = function (options) {
	return new L.Control.Attribution(options);
};


/*
 * L.Control.Scale is used for displaying metric/imperial scale on the map.
 */

L.Control.Scale = L.Control.extend({
	options: {
		position: 'bottomleft',
		maxWidth: 100,
		metric: true,
		imperial: true,
		updateWhenIdle: false
	},

	onAdd: function (map) {
		this._map = map;

		var className = 'leaflet-control-scale',
		    container = L.DomUtil.create('div', className),
		    options = this.options;

		this._addScales(options, className, container);

		map.on(options.updateWhenIdle ? 'moveend' : 'move', this._update, this);
		map.whenReady(this._update, this);

		return container;
	},

	onRemove: function (map) {
		map.off(this.options.updateWhenIdle ? 'moveend' : 'move', this._update, this);
	},

	_addScales: function (options, className, container) {
		if (options.metric) {
			this._mScale = L.DomUtil.create('div', className + '-line', container);
		}
		if (options.imperial) {
			this._iScale = L.DomUtil.create('div', className + '-line', container);
		}
	},

	_update: function () {
		var bounds = this._map.getBounds(),
		    centerLat = bounds.getCenter().lat,
		    halfWorldMeters = 6378137 * Math.PI * Math.cos(centerLat * Math.PI / 180),
		    dist = halfWorldMeters * (bounds.getNorthEast().lng - bounds.getSouthWest().lng) / 180,

		    size = this._map.getSize(),
		    options = this.options,
		    maxMeters = 0;

		if (size.x > 0) {
			maxMeters = dist * (options.maxWidth / size.x);
		}

		this._updateScales(options, maxMeters);
	},

	_updateScales: function (options, maxMeters) {
		if (options.metric && maxMeters) {
			this._updateMetric(maxMeters);
		}

		if (options.imperial && maxMeters) {
			this._updateImperial(maxMeters);
		}
	},

	_updateMetric: function (maxMeters) {
		var meters = this._getRoundNum(maxMeters);

		this._mScale.style.width = this._getScaleWidth(meters / maxMeters) + 'px';
		this._mScale.innerHTML = meters < 1000 ? meters + ' m' : (meters / 1000) + ' km';
	},

	_updateImperial: function (maxMeters) {
		var maxFeet = maxMeters * 3.2808399,
		    scale = this._iScale,
		    maxMiles, miles, feet;

		if (maxFeet > 5280) {
			maxMiles = maxFeet / 5280;
			miles = this._getRoundNum(maxMiles);

			scale.style.width = this._getScaleWidth(miles / maxMiles) + 'px';
			scale.innerHTML = miles + ' mi';

		} else {
			feet = this._getRoundNum(maxFeet);

			scale.style.width = this._getScaleWidth(feet / maxFeet) + 'px';
			scale.innerHTML = feet + ' ft';
		}
	},

	_getScaleWidth: function (ratio) {
		return Math.round(this.options.maxWidth * ratio) - 10;
	},

	_getRoundNum: function (num) {
		var pow10 = Math.pow(10, (Math.floor(num) + '').length - 1),
		    d = num / pow10;

		d = d >= 10 ? 10 : d >= 5 ? 5 : d >= 3 ? 3 : d >= 2 ? 2 : 1;

		return pow10 * d;
	}
});

L.control.scale = function (options) {
	return new L.Control.Scale(options);
};


/*
 * L.Control.Layers is a control to allow users to switch between different layers on the map.
 */

L.Control.Layers = L.Control.extend({
	options: {
		collapsed: true,
		position: 'topright',
		autoZIndex: true
	},

	initialize: function (baseLayers, overlays, options) {
		L.setOptions(this, options);

		this._layers = {};
		this._lastZIndex = 0;
		this._handlingClick = false;

		for (var i in baseLayers) {
			this._addLayer(baseLayers[i], i);
		}

		for (i in overlays) {
			this._addLayer(overlays[i], i, true);
		}
	},

	onAdd: function (map) {
		this._initLayout();
		this._update();

		map
		    .on('layeradd', this._onLayerChange, this)
		    .on('layerremove', this._onLayerChange, this);

		return this._container;
	},

	onRemove: function (map) {
		map
		    .off('layeradd', this._onLayerChange, this)
		    .off('layerremove', this._onLayerChange, this);
	},

	addBaseLayer: function (layer, name) {
		this._addLayer(layer, name);
		this._update();
		return this;
	},

	addOverlay: function (layer, name) {
		this._addLayer(layer, name, true);
		this._update();
		return this;
	},

	removeLayer: function (layer) {
		var id = L.stamp(layer);
		delete this._layers[id];
		this._update();
		return this;
	},

	_initLayout: function () {
		var className = 'leaflet-control-layers',
		    container = this._container = L.DomUtil.create('div', className);

		//Makes this work on IE10 Touch devices by stopping it from firing a mouseout event when the touch is released
		container.setAttribute('aria-haspopup', true);

		if (!L.Browser.touch) {
			L.DomEvent
				.disableClickPropagation(container)
				.disableScrollPropagation(container);
		} else {
			L.DomEvent.on(container, 'click', L.DomEvent.stopPropagation);
		}

		var form = this._form = L.DomUtil.create('form', className + '-list');

		if (this.options.collapsed) {
			if (!L.Browser.android) {
				L.DomEvent
				    .on(container, 'mouseover', this._expand, this)
				    .on(container, 'mouseout', this._collapse, this);
			}
			var link = this._layersLink = L.DomUtil.create('a', className + '-toggle', container);
			link.href = '#';
			link.title = 'Layers';

			if (L.Browser.touch) {
				L.DomEvent
				    .on(link, 'click', L.DomEvent.stop)
				    .on(link, 'click', this._expand, this);
			}
			else {
				L.DomEvent.on(link, 'focus', this._expand, this);
			}
			//Work around for Firefox android issue https://github.com/Leaflet/Leaflet/issues/2033
			L.DomEvent.on(form, 'click', function () {
				setTimeout(L.bind(this._onInputClick, this), 0);
			}, this);

			this._map.on('click', this._collapse, this);
			// TODO keyboard accessibility
		} else {
			this._expand();
		}

		this._baseLayersList = L.DomUtil.create('div', className + '-base', form);
		this._separator = L.DomUtil.create('div', className + '-separator', form);
		this._overlaysList = L.DomUtil.create('div', className + '-overlays', form);

		container.appendChild(form);
	},

	_addLayer: function (layer, name, overlay) {
		var id = L.stamp(layer);

		this._layers[id] = {
			layer: layer,
			name: name,
			overlay: overlay
		};

		if (this.options.autoZIndex && layer.setZIndex) {
			this._lastZIndex++;
			layer.setZIndex(this._lastZIndex);
		}
	},

	_update: function () {
		if (!this._container) {
			return;
		}

		this._baseLayersList.innerHTML = '';
		this._overlaysList.innerHTML = '';

		var baseLayersPresent = false,
		    overlaysPresent = false,
		    i, obj;

		for (i in this._layers) {
			obj = this._layers[i];
			this._addItem(obj);
			overlaysPresent = overlaysPresent || obj.overlay;
			baseLayersPresent = baseLayersPresent || !obj.overlay;
		}

		this._separator.style.display = overlaysPresent && baseLayersPresent ? '' : 'none';
	},

	_onLayerChange: function (e) {
		var obj = this._layers[L.stamp(e.layer)];

		if (!obj) { return; }

		if (!this._handlingClick) {
			this._update();
		}

		var type = obj.overlay ?
			(e.type === 'layeradd' ? 'overlayadd' : 'overlayremove') :
			(e.type === 'layeradd' ? 'baselayerchange' : null);

		if (type) {
			this._map.fire(type, obj);
		}
	},

	// IE7 bugs out if you create a radio dynamically, so you have to do it this hacky way (see http://bit.ly/PqYLBe)
	_createRadioElement: function (name, checked) {

		var radioHtml = '<input type="radio" class="leaflet-control-layers-selector" name="' + name + '"';
		if (checked) {
			radioHtml += ' checked="checked"';
		}
		radioHtml += '/>';

		var radioFragment = document.createElement('div');
		radioFragment.innerHTML = radioHtml;

		return radioFragment.firstChild;
	},

	_addItem: function (obj) {
		var label = document.createElement('label'),
		    input,
		    checked = this._map.hasLayer(obj.layer);

		if (obj.overlay) {
			input = document.createElement('input');
			input.type = 'checkbox';
			input.className = 'leaflet-control-layers-selector';
			input.defaultChecked = checked;
		} else {
			input = this._createRadioElement('leaflet-base-layers', checked);
		}

		input.layerId = L.stamp(obj.layer);

		L.DomEvent.on(input, 'click', this._onInputClick, this);

		var name = document.createElement('span');
		name.innerHTML = ' ' + obj.name;

		label.appendChild(input);
		label.appendChild(name);

		var container = obj.overlay ? this._overlaysList : this._baseLayersList;
		container.appendChild(label);

		return label;
	},

	_onInputClick: function () {
		var i, input, obj,
		    inputs = this._form.getElementsByTagName('input'),
		    inputsLen = inputs.length;

		this._handlingClick = true;

		for (i = 0; i < inputsLen; i++) {
			input = inputs[i];
			obj = this._layers[input.layerId];

			if (input.checked && !this._map.hasLayer(obj.layer)) {
				this._map.addLayer(obj.layer);

			} else if (!input.checked && this._map.hasLayer(obj.layer)) {
				this._map.removeLayer(obj.layer);
			}
		}

		this._handlingClick = false;

		this._refocusOnMap();
	},

	_expand: function () {
		L.DomUtil.addClass(this._container, 'leaflet-control-layers-expanded');
	},

	_collapse: function () {
		this._container.className = this._container.className.replace(' leaflet-control-layers-expanded', '');
	}
});

L.control.layers = function (baseLayers, overlays, options) {
	return new L.Control.Layers(baseLayers, overlays, options);
};


/*
 * L.PosAnimation is used by Leaflet internally for pan animations.
 */

L.PosAnimation = L.Class.extend({
	includes: L.Mixin.Events,

	run: function (el, newPos, duration, easeLinearity) { // (HTMLElement, Point[, Number, Number])
		this.stop();

		this._el = el;
		this._inProgress = true;
		this._newPos = newPos;

		this.fire('start');

		el.style[L.DomUtil.TRANSITION] = 'all ' + (duration || 0.25) +
		        's cubic-bezier(0,0,' + (easeLinearity || 0.5) + ',1)';

		L.DomEvent.on(el, L.DomUtil.TRANSITION_END, this._onTransitionEnd, this);
		L.DomUtil.setPosition(el, newPos);

		// toggle reflow, Chrome flickers for some reason if you don't do this
		L.Util.falseFn(el.offsetWidth);

		// there's no native way to track value updates of transitioned properties, so we imitate this
		this._stepTimer = setInterval(L.bind(this._onStep, this), 50);
	},

	stop: function () {
		if (!this._inProgress) { return; }

		// if we just removed the transition property, the element would jump to its final position,
		// so we need to make it stay at the current position

		L.DomUtil.setPosition(this._el, this._getPos());
		this._onTransitionEnd();
		L.Util.falseFn(this._el.offsetWidth); // force reflow in case we are about to start a new animation
	},

	_onStep: function () {
		var stepPos = this._getPos();
		if (!stepPos) {
			this._onTransitionEnd();
			return;
		}
		// jshint camelcase: false
		// make L.DomUtil.getPosition return intermediate position value during animation
		this._el._leaflet_pos = stepPos;

		this.fire('step');
	},

	// you can't easily get intermediate values of properties animated with CSS3 Transitions,
	// we need to parse computed style (in case of transform it returns matrix string)

	_transformRe: /([-+]?(?:\d*\.)?\d+)\D*, ([-+]?(?:\d*\.)?\d+)\D*\)/,

	_getPos: function () {
		var left, top, matches,
		    el = this._el,
		    style = window.getComputedStyle(el);

		if (L.Browser.any3d) {
			matches = style[L.DomUtil.TRANSFORM].match(this._transformRe);
			if (!matches) { return; }
			left = parseFloat(matches[1]);
			top  = parseFloat(matches[2]);
		} else {
			left = parseFloat(style.left);
			top  = parseFloat(style.top);
		}

		return new L.Point(left, top, true);
	},

	_onTransitionEnd: function () {
		L.DomEvent.off(this._el, L.DomUtil.TRANSITION_END, this._onTransitionEnd, this);

		if (!this._inProgress) { return; }
		this._inProgress = false;

		this._el.style[L.DomUtil.TRANSITION] = '';

		// jshint camelcase: false
		// make sure L.DomUtil.getPosition returns the final position value after animation
		this._el._leaflet_pos = this._newPos;

		clearInterval(this._stepTimer);

		this.fire('step').fire('end');
	}

});


/*
 * Extends L.Map to handle panning animations.
 */

L.Map.include({

	setView: function (center, zoom, options) {

		zoom = zoom === undefined ? this._zoom : this._limitZoom(zoom);
		center = this._limitCenter(L.latLng(center), zoom, this.options.maxBounds);
		options = options || {};

		if (this._panAnim) {
			this._panAnim.stop();
		}

		if (this._loaded && !options.reset && options !== true) {

			if (options.animate !== undefined) {
				options.zoom = L.extend({animate: options.animate}, options.zoom);
				options.pan = L.extend({animate: options.animate}, options.pan);
			}

			// try animating pan or zoom
			var animated = (this._zoom !== zoom) ?
				this._tryAnimatedZoom && this._tryAnimatedZoom(center, zoom, options.zoom) :
				this._tryAnimatedPan(center, options.pan);

			if (animated) {
				// prevent resize handler call, the view will refresh after animation anyway
				clearTimeout(this._sizeTimer);
				return this;
			}
		}

		// animation didn't start, just reset the map view
		this._resetView(center, zoom);

		return this;
	},

	panBy: function (offset, options) {
		offset = L.point(offset).round();
		options = options || {};

		if (!offset.x && !offset.y) {
			return this;
		}

		if (!this._panAnim) {
			this._panAnim = new L.PosAnimation();

			this._panAnim.on({
				'step': this._onPanTransitionStep,
				'end': this._onPanTransitionEnd
			}, this);
		}

		// don't fire movestart if animating inertia
		if (!options.noMoveStart) {
			this.fire('movestart');
		}

		// animate pan unless animate: false specified
		if (options.animate !== false) {
			L.DomUtil.addClass(this._mapPane, 'leaflet-pan-anim');

			var newPos = this._getMapPanePos().subtract(offset);
			this._panAnim.run(this._mapPane, newPos, options.duration || 0.25, options.easeLinearity);
		} else {
			this._rawPanBy(offset);
			this.fire('move').fire('moveend');
		}

		return this;
	},

	_onPanTransitionStep: function () {
		this.fire('move');
	},

	_onPanTransitionEnd: function () {
		L.DomUtil.removeClass(this._mapPane, 'leaflet-pan-anim');
		this.fire('moveend');
	},

	_tryAnimatedPan: function (center, options) {
		// difference between the new and current centers in pixels
		var offset = this._getCenterOffset(center)._floor();

		// don't animate too far unless animate: true specified in options
		if ((options && options.animate) !== true && !this.getSize().contains(offset)) { return false; }

		this.panBy(offset, options);

		return true;
	}
});


/*
 * L.PosAnimation fallback implementation that powers Leaflet pan animations
 * in browsers that don't support CSS3 Transitions.
 */

L.PosAnimation = L.DomUtil.TRANSITION ? L.PosAnimation : L.PosAnimation.extend({

	run: function (el, newPos, duration, easeLinearity) { // (HTMLElement, Point[, Number, Number])
		this.stop();

		this._el = el;
		this._inProgress = true;
		this._duration = duration || 0.25;
		this._easeOutPower = 1 / Math.max(easeLinearity || 0.5, 0.2);

		this._startPos = L.DomUtil.getPosition(el);
		this._offset = newPos.subtract(this._startPos);
		this._startTime = +new Date();

		this.fire('start');

		this._animate();
	},

	stop: function () {
		if (!this._inProgress) { return; }

		this._step();
		this._complete();
	},

	_animate: function () {
		// animation loop
		this._animId = L.Util.requestAnimFrame(this._animate, this);
		this._step();
	},

	_step: function () {
		var elapsed = (+new Date()) - this._startTime,
		    duration = this._duration * 1000;

		if (elapsed < duration) {
			this._runFrame(this._easeOut(elapsed / duration));
		} else {
			this._runFrame(1);
			this._complete();
		}
	},

	_runFrame: function (progress) {
		var pos = this._startPos.add(this._offset.multiplyBy(progress));
		L.DomUtil.setPosition(this._el, pos);

		this.fire('step');
	},

	_complete: function () {
		L.Util.cancelAnimFrame(this._animId);

		this._inProgress = false;
		this.fire('end');
	},

	_easeOut: function (t) {
		return 1 - Math.pow(1 - t, this._easeOutPower);
	}
});


/*
 * Extends L.Map to handle zoom animations.
 */

L.Map.mergeOptions({
	zoomAnimation: true,
	zoomAnimationThreshold: 4
});

if (L.DomUtil.TRANSITION) {

	L.Map.addInitHook(function () {
		// don't animate on browsers without hardware-accelerated transitions or old Android/Opera
		this._zoomAnimated = this.options.zoomAnimation && L.DomUtil.TRANSITION &&
				L.Browser.any3d && !L.Browser.android23 && !L.Browser.mobileOpera;

		// zoom transitions run with the same duration for all layers, so if one of transitionend events
		// happens after starting zoom animation (propagating to the map pane), we know that it ended globally
		if (this._zoomAnimated) {
			L.DomEvent.on(this._mapPane, L.DomUtil.TRANSITION_END, this._catchTransitionEnd, this);
		}
	});
}

L.Map.include(!L.DomUtil.TRANSITION ? {} : {

	_catchTransitionEnd: function (e) {
		if (this._animatingZoom && e.propertyName.indexOf('transform') >= 0) {
			this._onZoomTransitionEnd();
		}
	},

	_nothingToAnimate: function () {
		return !this._container.getElementsByClassName('leaflet-zoom-animated').length;
	},

	_tryAnimatedZoom: function (center, zoom, options) {

		if (this._animatingZoom) { return true; }

		options = options || {};

		// don't animate if disabled, not supported or zoom difference is too large
		if (!this._zoomAnimated || options.animate === false || this._nothingToAnimate() ||
		        Math.abs(zoom - this._zoom) > this.options.zoomAnimationThreshold) { return false; }

		// offset is the pixel coords of the zoom origin relative to the current center
		var scale = this.getZoomScale(zoom),
		    offset = this._getCenterOffset(center)._divideBy(1 - 1 / scale),
			origin = this._getCenterLayerPoint()._add(offset);

		// don't animate if the zoom origin isn't within one screen from the current center, unless forced
		if (options.animate !== true && !this.getSize().contains(offset)) { return false; }

		this
		    .fire('movestart')
		    .fire('zoomstart');

		this._animateZoom(center, zoom, origin, scale, null, true);

		return true;
	},

	_animateZoom: function (center, zoom, origin, scale, delta, backwards, forTouchZoom) {

		if (!forTouchZoom) {
			this._animatingZoom = true;
		}

		// put transform transition on all layers with leaflet-zoom-animated class
		L.DomUtil.addClass(this._mapPane, 'leaflet-zoom-anim');

		// remember what center/zoom to set after animation
		this._animateToCenter = center;
		this._animateToZoom = zoom;

		// disable any dragging during animation
		if (L.Draggable) {
			L.Draggable._disabled = true;
		}

		L.Util.requestAnimFrame(function () {
			this.fire('zoomanim', {
				center: center,
				zoom: zoom,
				origin: origin,
				scale: scale,
				delta: delta,
				backwards: backwards
			});
		}, this);
	},

	_onZoomTransitionEnd: function () {

		this._animatingZoom = false;

		L.DomUtil.removeClass(this._mapPane, 'leaflet-zoom-anim');

		this._resetView(this._animateToCenter, this._animateToZoom, true, true);

		if (L.Draggable) {
			L.Draggable._disabled = false;
		}
	}
});


/*
	Zoom animation logic for L.TileLayer.
*/

L.TileLayer.include({
	_animateZoom: function (e) {
		if (!this._animating) {
			this._animating = true;
			this._prepareBgBuffer();
		}

		var bg = this._bgBuffer,
		    transform = L.DomUtil.TRANSFORM,
		    initialTransform = e.delta ? L.DomUtil.getTranslateString(e.delta) : bg.style[transform],
		    scaleStr = L.DomUtil.getScaleString(e.scale, e.origin);

		bg.style[transform] = e.backwards ?
				scaleStr + ' ' + initialTransform :
				initialTransform + ' ' + scaleStr;
	},

	_endZoomAnim: function () {
		var front = this._tileContainer,
		    bg = this._bgBuffer;

		front.style.visibility = '';
		front.parentNode.appendChild(front); // Bring to fore

		// force reflow
		L.Util.falseFn(bg.offsetWidth);

		this._animating = false;
	},

	_clearBgBuffer: function () {
		var map = this._map;

		if (map && !map._animatingZoom && !map.touchZoom._zooming) {
			this._bgBuffer.innerHTML = '';
			this._bgBuffer.style[L.DomUtil.TRANSFORM] = '';
		}
	},

	_prepareBgBuffer: function () {

		var front = this._tileContainer,
		    bg = this._bgBuffer;

		// if foreground layer doesn't have many tiles but bg layer does,
		// keep the existing bg layer and just zoom it some more

		var bgLoaded = this._getLoadedTilesPercentage(bg),
		    frontLoaded = this._getLoadedTilesPercentage(front);

		if (bg && bgLoaded > 0.5 && frontLoaded < 0.5) {

			front.style.visibility = 'hidden';
			this._stopLoadingImages(front);
			return;
		}

		// prepare the buffer to become the front tile pane
		bg.style.visibility = 'hidden';
		bg.style[L.DomUtil.TRANSFORM] = '';

		// switch out the current layer to be the new bg layer (and vice-versa)
		this._tileContainer = bg;
		bg = this._bgBuffer = front;

		this._stopLoadingImages(bg);

		//prevent bg buffer from clearing right after zoom
		clearTimeout(this._clearBgBufferTimer);
	},

	_getLoadedTilesPercentage: function (container) {
		var tiles = container.getElementsByTagName('img'),
		    i, len, count = 0;

		for (i = 0, len = tiles.length; i < len; i++) {
			if (tiles[i].complete) {
				count++;
			}
		}
		return count / len;
	},

	// stops loading all tiles in the background layer
	_stopLoadingImages: function (container) {
		var tiles = Array.prototype.slice.call(container.getElementsByTagName('img')),
		    i, len, tile;

		for (i = 0, len = tiles.length; i < len; i++) {
			tile = tiles[i];

			if (!tile.complete) {
				tile.onload = L.Util.falseFn;
				tile.onerror = L.Util.falseFn;
				tile.src = L.Util.emptyImageUrl;

				tile.parentNode.removeChild(tile);
			}
		}
	}
});


/*
 * Provides L.Map with convenient shortcuts for using browser geolocation features.
 */

L.Map.include({
	_defaultLocateOptions: {
		watch: false,
		setView: false,
		maxZoom: Infinity,
		timeout: 10000,
		maximumAge: 0,
		enableHighAccuracy: false
	},

	locate: function (/*Object*/ options) {

		options = this._locateOptions = L.extend(this._defaultLocateOptions, options);

		if (!navigator.geolocation) {
			this._handleGeolocationError({
				code: 0,
				message: 'Geolocation not supported.'
			});
			return this;
		}

		var onResponse = L.bind(this._handleGeolocationResponse, this),
			onError = L.bind(this._handleGeolocationError, this);

		if (options.watch) {
			this._locationWatchId =
			        navigator.geolocation.watchPosition(onResponse, onError, options);
		} else {
			navigator.geolocation.getCurrentPosition(onResponse, onError, options);
		}
		return this;
	},

	stopLocate: function () {
		if (navigator.geolocation) {
			navigator.geolocation.clearWatch(this._locationWatchId);
		}
		if (this._locateOptions) {
			this._locateOptions.setView = false;
		}
		return this;
	},

	_handleGeolocationError: function (error) {
		var c = error.code,
		    message = error.message ||
		            (c === 1 ? 'permission denied' :
		            (c === 2 ? 'position unavailable' : 'timeout'));

		if (this._locateOptions.setView && !this._loaded) {
			this.fitWorld();
		}

		this.fire('locationerror', {
			code: c,
			message: 'Geolocation error: ' + message + '.'
		});
	},

	_handleGeolocationResponse: function (pos) {
		var lat = pos.coords.latitude,
		    lng = pos.coords.longitude,
		    latlng = new L.LatLng(lat, lng),

		    latAccuracy = 180 * pos.coords.accuracy / 40075017,
		    lngAccuracy = latAccuracy / Math.cos(L.LatLng.DEG_TO_RAD * lat),

		    bounds = L.latLngBounds(
		            [lat - latAccuracy, lng - lngAccuracy],
		            [lat + latAccuracy, lng + lngAccuracy]),

		    options = this._locateOptions;

		if (options.setView) {
			var zoom = Math.min(this.getBoundsZoom(bounds), options.maxZoom);
			this.setView(latlng, zoom);
		}

		var data = {
			latlng: latlng,
			bounds: bounds,
			timestamp: pos.timestamp
		};

		for (var i in pos.coords) {
			if (typeof pos.coords[i] === 'number') {
				data[i] = pos.coords[i];
			}
		}

		this.fire('locationfound', data);
	}
});


}(window, document));
},{}],12:[function(require,module,exports){
var polyline = {};

// Based off of [the offical Google document](https://developers.google.com/maps/documentation/utilities/polylinealgorithm)
//
// Some parts from [this implementation](http://facstaff.unca.edu/mcmcclur/GoogleMaps/EncodePolyline/PolylineEncoder.js)
// by [Mark McClure](http://facstaff.unca.edu/mcmcclur/)

function encode(coordinate, factor) {
    coordinate = Math.round(coordinate * factor);
    coordinate <<= 1;
    if (coordinate < 0) {
        coordinate = ~coordinate;
    }
    var output = '';
    while (coordinate >= 0x20) {
        output += String.fromCharCode((0x20 | (coordinate & 0x1f)) + 63);
        coordinate >>= 5;
    }
    output += String.fromCharCode(coordinate + 63);
    return output;
}

// This is adapted from the implementation in Project-OSRM
// https://github.com/DennisOSRM/Project-OSRM-Web/blob/master/WebContent/routing/OSRM.RoutingGeometry.js
polyline.decode = function(str, precision) {
    var index = 0,
        lat = 0,
        lng = 0,
        coordinates = [],
        shift = 0,
        result = 0,
        byte = null,
        latitude_change,
        longitude_change,
        factor = Math.pow(10, precision || 5);

    // Coordinates have variable length when encoded, so just keep
    // track of whether we've hit the end of the string. In each
    // loop iteration, a single coordinate is decoded.
    while (index < str.length) {

        // Reset shift, result, and byte
        byte = null;
        shift = 0;
        result = 0;

        do {
            byte = str.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));

        shift = result = 0;

        do {
            byte = str.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));

        lat += latitude_change;
        lng += longitude_change;

        coordinates.push([lat / factor, lng / factor]);
    }

    return coordinates;
};

polyline.encode = function(coordinates, precision) {
    if (!coordinates.length) return '';

    var factor = Math.pow(10, precision || 5),
        output = encode(coordinates[0][0], factor) + encode(coordinates[0][1], factor);

    for (var i = 1; i < coordinates.length; i++) {
        var a = coordinates[i], b = coordinates[i - 1];
        output += encode(a[0] - b[0], factor);
        output += encode(a[1] - b[1], factor);
    }

    return output;
};

if (typeof module !== undefined) module.exports = polyline;

},{}],13:[function(require,module,exports){
(function() {
	'use strict';

	L.Routing = L.Routing || {};

	L.Routing.Autocomplete = L.Class.extend({
		options: {
			timeout: 500,
			blurTimeout: 100,
			noResultsMessage: 'No results found.'
		},

		initialize: function(elem, callback, context, options) {
			L.setOptions(this, options);

			this._elem = elem;
			this._resultFn = options.resultFn ? L.Util.bind(options.resultFn, options.resultContext) : null;
			this._autocomplete = options.autocompleteFn ? L.Util.bind(options.autocompleteFn, options.autocompleteContext) : null;
			this._selectFn = L.Util.bind(callback, context);
			this._container = L.DomUtil.create('div', 'leaflet-routing-geocoder-result');
			this._resultTable = L.DomUtil.create('table', '', this._container);

			// TODO: looks a bit like a kludge to register same for input and keypress -
			// browsers supporting both will get duplicate events; just registering
			// input will not catch enter, though.
			L.DomEvent.addListener(this._elem, 'input', this._keyPressed, this);
			L.DomEvent.addListener(this._elem, 'keypress', this._keyPressed, this);
			L.DomEvent.addListener(this._elem, 'keydown', this._keyDown, this);
			L.DomEvent.addListener(this._elem, 'blur', function() {
				if (this._isOpen) {
					this.close();
				}
			}, this);
		},

		close: function() {
			L.DomUtil.removeClass(this._container, 'leaflet-routing-geocoder-result-open');
			this._isOpen = false;
		},

		_open: function() {
			var rect = this._elem.getBoundingClientRect();
			if (!this._container.parentElement) {
				this._container.style.left = (rect.left + window.scrollX) + 'px';
				this._container.style.top = (rect.bottom + window.scrollY) + 'px';
				this._container.style.width = (rect.right - rect.left) + 'px';
				document.body.appendChild(this._container);
			}

			L.DomUtil.addClass(this._container, 'leaflet-routing-geocoder-result-open');
			this._isOpen = true;
		},

		_setResults: function(results) {
			var i,
			    tr,
			    td,
			    text;

			delete this._selection;
			this._results = results;

			while (this._resultTable.firstChild) {
				this._resultTable.removeChild(this._resultTable.firstChild);
			}

			for (i = 0; i < results.length; i++) {
				tr = L.DomUtil.create('tr', '', this._resultTable);
				tr.setAttribute('data-result-index', i);
				td = L.DomUtil.create('td', '', tr);
				text = document.createTextNode(results[i].name);
				td.appendChild(text);
				// mousedown + click because:
				// http://stackoverflow.com/questions/10652852/jquery-fire-click-before-blur-event
				L.DomEvent.addListener(td, 'mousedown', L.DomEvent.preventDefault);
				L.DomEvent.addListener(td, 'click', this._createClickListener(results[i]));
			}

			if (!i) {
				tr = L.DomUtil.create('tr', '', this._resultTable);
				td = L.DomUtil.create('td', 'leaflet-routing-geocoder-no-results', tr);
				td.innerHTML = this.options.noResultsMessage;
			}

			this._open();

			if (results.length > 0) {
				// Select the first entry
				this._select(1);
			}
		},

		_createClickListener: function(r) {
			var resultSelected = this._resultSelected(r);
			return L.bind(function() {
				this._elem.blur();
				resultSelected();
			}, this);
		},

		_resultSelected: function(r) {
			return L.bind(function() {
				this.close();
				this._elem.value = r.name;
				this._lastCompletedText = r.name;
				this._selectFn(r);
			}, this);
		},

		_keyPressed: function(e) {
			var index;

			if (this._isOpen && e.keyCode === 13 && this._selection) {
				index = parseInt(this._selection.getAttribute('data-result-index'), 10);
				this._resultSelected(this._results[index])();
				L.DomEvent.preventDefault(e);
				return;
			}

			if (e.keyCode === 13) {
				this._complete(this._resultFn, true);
				return;
			}

			if (this._autocomplete && document.activeElement === this._elem) {
				if (this._timer) {
					clearTimeout(this._timer);
				}
				this._timer = setTimeout(L.Util.bind(function() { this._complete(this._autocomplete); }, this),
					this.options.timeout);
				return;
			}

			this._unselect();
		},

		_select: function(dir) {
			var sel = this._selection;
			if (sel) {
				L.DomUtil.removeClass(sel.firstChild, 'leaflet-routing-geocoder-selected');
				sel = sel[dir > 0 ? 'nextSibling' : 'previousSibling'];
			}
			if (!sel) {
				sel = this._resultTable[dir > 0 ? 'firstChild' : 'lastChild'];
			}

			if (sel) {
				L.DomUtil.addClass(sel.firstChild, 'leaflet-routing-geocoder-selected');
				this._selection = sel;
			}
		},

		_unselect: function() {
			if (this._selection) {
				L.DomUtil.removeClass(this._selection.firstChild, 'leaflet-routing-geocoder-selected');
			}
			delete this._selection;
		},

		_keyDown: function(e) {
			if (this._isOpen) {
				switch (e.keyCode) {
				// Escape
				case 27:
					this.close();
					L.DomEvent.preventDefault(e);
					return;
				// Up
				case 38:
					this._select(-1);
					L.DomEvent.preventDefault(e);
					return;
				// Down
				case 40:
					this._select(1);
					L.DomEvent.preventDefault(e);
					return;
				}
			}
		},

		_complete: function(completeFn, trySelect) {
			var v = this._elem.value;
			function completeResults(results) {
				this._lastCompletedText = v;
				if (trySelect && results.length === 1) {
					this._resultSelected(results[0])();
				} else {
					this._setResults(results);
				}
			}

			if (!v) {
				return;
			}

			if (v !== this._lastCompletedText) {
				completeFn(v, completeResults, this);
			} else if (trySelect) {
				completeResults.call(this, this._results);
			}
		}
	});
})();

},{}],14:[function(require,module,exports){
(function() {
	'use strict';

	var L = require('leaflet');

	L.Routing = L.Routing || {};
	L.extend(L.Routing, require('./L.Routing.Itinerary'));
	L.extend(L.Routing, require('./L.Routing.Line'));
	L.extend(L.Routing, require('./L.Routing.Plan'));
	L.extend(L.Routing, require('./L.Routing.OSRM'));

	L.Routing.Control = L.Routing.Itinerary.extend({
		options: {
			fitSelectedRoutes: 'smart',
			routeLine: function(route, options) { return L.Routing.line(route, options); },
			autoRoute: true,
			routeWhileDragging: false,
			routeDragInterval: 500,
			waypointMode: 'connect',
			useZoomParameter: false
		},

		initialize: function(options) {
			L.Util.setOptions(this, options);

			this._router = this.options.router || new L.Routing.OSRM(options);
			this._plan = this.options.plan || L.Routing.plan(this.options.waypoints, options);
			this._requestCount = 0;

			L.Routing.Itinerary.prototype.initialize.call(this, options);

			this.on('routeselected', this._routeSelected, this);
			this._plan.on('waypointschanged', this._onWaypointsChanged, this);
			if (options.routeWhileDragging) {
				this._setupRouteDragging();
			}

			if (this.options.autoRoute) {
				this.route();
			}
		},

		onAdd: function(map) {
			var container = L.Routing.Itinerary.prototype.onAdd.call(this, map);

			this._map = map;
			this._map.addLayer(this._plan);

			if (this.options.useZoomParameter) {
				this._map.on('zoomend', function() {
					this.route({
						callback: L.bind(this._updateLineCallback, this)
					});
				}, this);
			}

			if (this._plan.options.geocoder) {
				container.insertBefore(this._plan.createGeocoders(), container.firstChild);
			}

			return container;
		},

		onRemove: function(map) {
			if (this._line) {
				map.removeLayer(this._line);
			}
			map.removeLayer(this._plan);
			return L.Routing.Itinerary.prototype.onRemove.call(this, map);
		},

		getWaypoints: function() {
			return this._plan.getWaypoints();
		},

		setWaypoints: function(waypoints) {
			this._plan.setWaypoints(waypoints);
			return this;
		},

		spliceWaypoints: function() {
			var removed = this._plan.spliceWaypoints.apply(this._plan, arguments);
			return removed;
		},

		getPlan: function() {
			return this._plan;
		},

		getRouter: function() {
			return this._router;
		},

		_routeSelected: function(e) {
			var route = e.route,
				fitMode = this.options.fitSelectedRoutes,
				fitBounds =
					(fitMode === 'smart' && !this._waypointsVisible()) ||
					(fitMode !== 'smart' && fitMode);

			this._updateLine(route);

			if (fitBounds) {
				this._map.fitBounds(this._line.getBounds());
			}

			if (this.options.waypointMode === 'snap') {
				this._plan.off('waypointschanged', this._onWaypointsChanged, this);
				this.setWaypoints(route.waypoints);
				this._plan.on('waypointschanged', this._onWaypointsChanged, this);
			}
		},

		_waypointsVisible: function() {
			var wps = this.getWaypoints(),
				mapSize,
				bounds,
				boundsSize,
				i,
				p;

			try {
				mapSize = this._map.getSize();

				for (i = 0; i < wps.length; i++) {
					p = this._map.latLngToLayerPoint(wps[i].latLng);

					if (bounds) {
						bounds.extend(p);
					} else {
						bounds = L.bounds([p]);
					}
				}

				boundsSize = bounds.getSize();
				return (boundsSize.x > mapSize.x / 5 ||
					boundsSize.y > mapSize.y / 5) && this._waypointsInViewport();
					
			} catch (e) {
				return false;
			}
		},

		_waypointsInViewport: function() {
			var wps = this.getWaypoints(),
				mapBounds,
				i;

			try {
				mapBounds = this._map.getBounds();
			} catch (e) {
				return false;
			}

			for (i = 0; i < wps.length; i++) {
				if (mapBounds.contains(wps[i].latLng)) {
					return true;
				}
			}

			return false;
		},

		_updateLine: function(route) {
			var addWaypoints = this.options.addWaypoints !== undefined ?
				this.options.addWaypoints : true;
			this._clearLine();

			this._line = this.options.routeLine(route,
				L.extend({
					addWaypoints: addWaypoints,
					extendToWaypoints: this.options.waypointMode === 'connect'
				}, this.options.lineOptions));
			this._line.addTo(this._map);
			this._hookEvents(this._line);
		},

		_hookEvents: function(l) {
			l.on('linetouched', function(e) {
				this._plan.dragNewWaypoint(e);
			}, this);
		},

		_onWaypointsChanged: function(e) {
			if (this.options.autoRoute) {
				this.route({});
			}
			if (!this._plan.isReady()) {
				this._clearLine();
				this._clearAlts();
			}
			this.fire('waypointschanged', {waypoints: e.waypoints});
		},

		_setupRouteDragging: function() {
			var timer = 0,
				waypoints;

			this._plan.on('waypointdrag', L.bind(function(e) {
				waypoints = e.waypoints;

				if (!timer) {
					timer = setTimeout(L.bind(function() {
						this.route({
							waypoints: waypoints,
							geometryOnly: true,
							callback: L.bind(this._updateLineCallback, this)
						});
						timer = undefined;
					}, this), this.options.routeDragInterval);
				}
			}, this));
			this._plan.on('waypointdragend', function() {
				if (timer) {
					clearTimeout(timer);
					timer = undefined;
				}
				this.route();
			}, this);
		},

		_updateLineCallback: function(err, routes) {
			if (!err) {
				this._updateLine(routes[0]);
			}
		},

		route: function(options) {
			var ts = ++this._requestCount,
				wps;

			options = options || {};

			if (this._plan.isReady()) {
				if (this.options.useZoomParameter) {
					options.z = this._map && this._map.getZoom();
				}

				wps = options && options.waypoints || this._plan.getWaypoints();
				this.fire('routingstart', {waypoints: wps});
				this._router.route(wps, options.callback || function(err, routes) {
					// Prevent race among multiple requests,
					// by checking the current request's timestamp
					// against the last request's; ignore result if
					// this isn't the latest request.
					if (ts === this._requestCount) {
						this._clearLine();
						this._clearAlts();
						if (err) {
							this.fire('routingerror', {error: err});
							return;
						}

						if (!options.geometryOnly) {
							this.fire('routesfound', {waypoints: wps, routes: routes});
							this.setAlternatives(routes);
						} else {
							this._routeSelected({route: routes[0]});
						}
					}
				}, this, options);
			}
		},

		_clearLine: function() {
			if (this._line) {
				this._map.removeLayer(this._line);
				delete this._line;
			}
		}
	});

	L.Routing.control = function(options) {
		return new L.Routing.Control(options);
	};

	module.exports = L.Routing;
})();

},{"./L.Routing.Itinerary":16,"./L.Routing.Line":18,"./L.Routing.OSRM":20,"./L.Routing.Plan":21,"leaflet":11}],15:[function(require,module,exports){
(function() {
	'use strict';

	var L = require('leaflet');

	L.Routing = L.Routing || {};

	L.extend(L.Routing, require('./L.Routing.Localization'));

	L.Routing.Formatter = L.Class.extend({
		options: {
			units: 'metric',
			unitNames: {
				meters: 'm',
				kilometers: 'km',
				yards: 'yd',
				miles: 'mi',
				hours: 'h',
				minutes: 'mín',
				seconds: 's'
			},
			language: 'en',
			roundingSensitivity: 1,
			distanceTemplate: '{value} {unit}'
		},

		initialize: function(options) {
			L.setOptions(this, options);
		},

		formatDistance: function(d /* Number (meters) */) {
			var un = this.options.unitNames,
			    v,
				data;

			if (this.options.units === 'imperial') {
				d = d / 1.609344;
				if (d >= 1000) {
					data = {
						value: (this._round(d) / 1000),
						unit: un.miles
					};
				} else {
					data = {
						value: this._round(d / 1.760),
						unit: un.yards
					};
				}
			} else {
				v = this._round(d);
				data = {
					value: v >= 1000 ? (v / 1000) : v,
					unit: v >= 1000 ? un.kilometers : un.meters
				};
			}

			return L.Util.template(this.options.distanceTemplate, data);
		},

		_round: function(d) {
			var pow10 = Math.pow(10, (Math.floor(d / this.options.roundingSensitivity) + '').length - 1),
				r = Math.floor(d / pow10),
				p = (r > 5) ? pow10 : pow10 / 2;

			return Math.round(d / p) * p;
		},

		formatTime: function(t /* Number (seconds) */) {
			if (t > 86400) {
				return Math.round(t / 3600) + ' h';
			} else if (t > 3600) {
				return Math.floor(t / 3600) + ' h ' +
					Math.round((t % 3600) / 60) + ' min';
			} else if (t > 300) {
				return Math.round(t / 60) + ' min';
			} else if (t > 60) {
				return Math.floor(t / 60) + ' min' +
					(t % 60 !== 0 ? ' ' + (t % 60) + ' s' : '');
			} else {
				return t + ' s';
			}
		},

		formatInstruction: function(instr, i) {
			if (instr.text === undefined) {
				return L.Util.template(this._getInstructionTemplate(instr, i),
					L.extend({
						exitStr: instr.exit ? L.Routing.Localization[this.options.language].formatOrder(instr.exit) : '',
						dir: L.Routing.Localization[this.options.language].directions[instr.direction]
					},
					instr));
			} else {
				return instr.text;
			}
		},

		getIconName: function(instr, i) {
			switch (instr.type) {
			case 'Straight':
				return (i === 0 ? 'depart' : 'continue');
			case 'SlightRight':
				return 'bear-right';
			case 'Right':
				return 'turn-right';
			case 'SharpRight':
				return 'sharp-right';
			case 'TurnAround':
				return 'u-turn';
			case 'SharpLeft':
				return 'sharp-left';
			case 'Left':
				return 'turn-left';
			case 'SlightLeft':
				return 'bear-left';
			case 'WaypointReached':
				return 'via';
			case 'Roundabout':
				return 'enter-roundabout';
			case 'DestinationReached':
				return 'arrive';
			}
		},

		_getInstructionTemplate: function(instr, i) {
			var type = instr.type === 'Straight' ? (i === 0 ? 'Head' : 'Continue') : instr.type,
				strings = L.Routing.Localization[this.options.language].instructions[type];

			return strings[0] + (strings.length > 1 && instr.road ? strings[1] : '');
		}
	});

	module.exports = L.Routing;
})();


},{"./L.Routing.Localization":19,"leaflet":11}],16:[function(require,module,exports){
(function() {
	'use strict';

	var L = require('leaflet');

	L.Routing = L.Routing || {};
	L.extend(L.Routing, require('./L.Routing.Formatter'));
	L.extend(L.Routing, require('./L.Routing.ItineraryBuilder'));

	L.Routing.Itinerary = L.Control.extend({
		includes: L.Mixin.Events,

		options: {
			pointMarkerStyle: {
				radius: 5,
				color: '#03f',
				fillColor: 'white',
				opacity: 1,
				fillOpacity: 0.7
			},
			summaryTemplate: '<h2>{name}</h2><h3>{distance}, {time}</h3>',
			timeTemplate: '{time}',
			containerClassName: '',
			alternativeClassName: '',
			minimizedClassName: '',
			itineraryClassName: '',
			show: true,
			collapsible: undefined
		},

		initialize: function(options) {
			L.setOptions(this, options);
			this._formatter = this.options.formatter || new L.Routing.Formatter(this.options);
			this._itineraryBuilder = this.options.itineraryBuilder || new L.Routing.ItineraryBuilder({
				containerClassName: this.options.itineraryClassName
			});
		},

		onAdd: function(map) {
			var collapsible = this.options.collapsible,
				collapseBtn;

			collapsible = collapsible || (collapsible === undefined && map.getSize().x <= 640);

			this._container = L.DomUtil.create('div', 'leaflet-routing-container leaflet-bar ' +
				(!this.options.show ? 'leaflet-routing-container-hide ' : '') +
				(collapsible ? 'leaflet-routing-collapsible ' : '') +
				this.options.containerClassName);
			this._altContainer = this.createAlternativesContainer();
			this._container.appendChild(this._altContainer);
			L.DomEvent.disableClickPropagation(this._container);
			L.DomEvent.addListener(this._container, 'mousewheel', function(e) {
				L.DomEvent.stopPropagation(e);
			});

			if (collapsible) {
				collapseBtn = L.DomUtil.create('span', 'leaflet-routing-collapse-btn');
				L.DomEvent.on(collapseBtn, 'click', this._toggle, this);
				this._container.insertBefore(collapseBtn, this._container.firstChild);
			}

			return this._container;
		},

		onRemove: function() {
		},

		createAlternativesContainer: function() {
			return L.DomUtil.create('div', 'leaflet-routing-alternatives-container');
		},

		setAlternatives: function(routes) {
			var i,
			    alt,
			    altDiv;

			this._clearAlts();

			this._routes = routes;

			for (i = 0; i < this._routes.length; i++) {
				alt = this._routes[i];
				altDiv = this._createAlternative(alt, i);
				this._altContainer.appendChild(altDiv);
				this._altElements.push(altDiv);
			}

			this.fire('routeselected', {route: this._routes[0]});

			return this;
		},

		show: function() {
			L.DomUtil.removeClass(this._container, 'leaflet-routing-container-hide');
		},

		hide: function() {
			L.DomUtil.addClass(this._container, 'leaflet-routing-container-hide');
		},

		_toggle: function() {
			var collapsed = L.DomUtil.hasClass(this._container, 'leaflet-routing-container-hide');
			this[collapsed ? 'show' : 'hide']();
		},

		_createAlternative: function(alt, i) {
			var altDiv = L.DomUtil.create('div', 'leaflet-routing-alt ' +
				this.options.alternativeClassName +
				(i > 0 ? ' leaflet-routing-alt-minimized ' + this.options.minimizedClassName : '')),
				template = this.options.summaryTemplate,
				data = L.extend({
					name: alt.name,
					distance: this._formatter.formatDistance(alt.summary.totalDistance),
					time: this._formatter.formatTime(alt.summary.totalTime)
				}, alt);
			altDiv.innerHTML = typeof(template) === 'function' ? template(data) : L.Util.template(template, data);
			L.DomEvent.addListener(altDiv, 'click', this._onAltClicked, this);

			altDiv.appendChild(this._createItineraryContainer(alt));
			return altDiv;
		},

		_clearAlts: function() {
			var el = this._altContainer;
			while (el && el.firstChild) {
				el.removeChild(el.firstChild);
			}

			this._altElements = [];
		},


		_createItineraryContainer: function(r) {
			var container = this._itineraryBuilder.createContainer(),
			    steps = this._itineraryBuilder.createStepsContainer(),
			    i,
			    instr,
			    step,
			    distance,
			    text,
			    icon;

			container.appendChild(steps);

			for (i = 0; i < r.instructions.length; i++) {
				instr = r.instructions[i];
				text = this._formatter.formatInstruction(instr, i);
				distance = this._formatter.formatDistance(instr.distance);
				icon = this._formatter.getIconName(instr, i);
				step = this._itineraryBuilder.createStep(text, distance, icon, steps);

				this._addRowListeners(step, r.coordinates[instr.index]);
			}

			return container;
		},

		_addRowListeners: function(row, coordinate) {
			var _this = this,
			    marker;
			L.DomEvent.addListener(row, 'mouseover', function() {
				marker = L.circleMarker(coordinate,
					_this.options.pointMarkerStyle).addTo(_this._map);
			});
			L.DomEvent.addListener(row, 'mouseout', function() {
				if (marker) {
					_this._map.removeLayer(marker);
					marker = null;
				}
			});
			L.DomEvent.addListener(row, 'click', function(e) {
				_this._map.panTo(coordinate);
				L.DomEvent.stopPropagation(e);
			});
		},

		_onAltClicked: function(e) {
			var altElem,
			    j,
			    n,
			    isCurrentSelection,
			    classFn;

			altElem = e.target || window.event.srcElement;
			while (!L.DomUtil.hasClass(altElem, 'leaflet-routing-alt')) {
				altElem = altElem.parentElement;
			}

			if (L.DomUtil.hasClass(altElem, 'leaflet-routing-alt-minimized')) {
				for (j = 0; j < this._altElements.length; j++) {
					n = this._altElements[j];
					isCurrentSelection = altElem === n;
					classFn = isCurrentSelection ? 'removeClass' : 'addClass';
					L.DomUtil[classFn](n, 'leaflet-routing-alt-minimized');
					if (this.options.minimizedClassName) {
						L.DomUtil[classFn](n, this.options.minimizedClassName);
					}

					if (isCurrentSelection) {
						// TODO: don't fire if the currently active is clicked
						this.fire('routeselected', {route: this._routes[j]});
					} else {
						n.scrollTop = 0;
					}
				}
			}

			L.DomEvent.stop(e);
		},
	});

	L.Routing.itinerary = function(options) {
		return new L.Routing.Itinerary(options);
	};

	module.exports = L.Routing;
})();

},{"./L.Routing.Formatter":15,"./L.Routing.ItineraryBuilder":17,"leaflet":11}],17:[function(require,module,exports){
(function() {
	'use strict';

	var L = require('leaflet');
	L.Routing = L.Routing || {};

	L.Routing.ItineraryBuilder = L.Class.extend({
		options: {
			containerClassName: ''
		},

		initialize: function(options) {
			L.setOptions(this, options);
		},

		createContainer: function(className) {
			var table = L.DomUtil.create('table', className || ''),
				colgroup = L.DomUtil.create('colgroup', '', table);

			L.DomUtil.create('col', 'leaflet-routing-instruction-icon', colgroup);
			L.DomUtil.create('col', 'leaflet-routing-instruction-text', colgroup);
			L.DomUtil.create('col', 'leaflet-routing-instruction-distance', colgroup);

			return table;
		},

		createStepsContainer: function() {
			return L.DomUtil.create('tbody', '');
		},

		createStep: function(text, distance, icon, steps) {
			var row = L.DomUtil.create('tr', '', steps),
				span,
				td;
			td = L.DomUtil.create('td', '', row);
			span = L.DomUtil.create('span', 'leaflet-routing-icon leaflet-routing-icon-'+icon, td);
			td.appendChild(span);
			td = L.DomUtil.create('td', '', row);
			td.appendChild(document.createTextNode(text));
			td = L.DomUtil.create('td', '', row);
			td.appendChild(document.createTextNode(distance));
			return row;
		}
	});

	module.exports = L.Routing;
})();

},{"leaflet":11}],18:[function(require,module,exports){
(function() {
	'use strict';

	var L = require('leaflet');

	L.Routing = L.Routing || {};

	L.Routing.Line = L.LayerGroup.extend({
		includes: L.Mixin.Events,

		options: {
			styles: [
				{color: 'black', opacity: 0.15, weight: 9},
				{color: 'white', opacity: 0.8, weight: 6},
				{color: 'red', opacity: 1, weight: 2}
			],
			missingRouteStyles: [
				{color: 'black', opacity: 0.15, weight: 7},
				{color: 'white', opacity: 0.6, weight: 4},
				{color: 'gray', opacity: 0.8, weight: 2, dashArray: '7,12'}
			],
			addWaypoints: true,
			extendToWaypoints: true,
			missingRouteTolerance: 10
		},

		initialize: function(route, options) {
			L.setOptions(this, options);
			L.LayerGroup.prototype.initialize.call(this, options);
			this._route = route;

			if (this.options.extendToWaypoints) {
				this._extendToWaypoints();
			}

			this._addSegment(
				route.coordinates,
				this.options.styles,
				this.options.addWaypoints);
		},

		addTo: function(map) {
			map.addLayer(this);
			return this;
		},
		getBounds: function() {
			return L.latLngBounds(this._route.coordinates);
		},

		_findWaypointIndices: function() {
			var wps = this._route.inputWaypoints,
			    indices = [],
			    i;
			for (i = 0; i < wps.length; i++) {
				indices.push(this._findClosestRoutePoint(wps[i].latLng));
			}

			return indices;
		},

		_findClosestRoutePoint: function(latlng) {
			var minDist = Number.MAX_VALUE,
				minIndex,
			    i,
			    d;

			for (i = this._route.coordinates.length - 1; i >= 0 ; i--) {
				// TODO: maybe do this in pixel space instead?
				d = latlng.distanceTo(this._route.coordinates[i]);
				if (d < minDist) {
					minIndex = i;
					minDist = d;
				}
			}

			return minIndex;
		},

		_extendToWaypoints: function() {
			var wps = this._route.inputWaypoints,
				wpIndices = this._getWaypointIndices(),
			    i,
			    wpLatLng,
			    routeCoord;

			for (i = 0; i < wps.length; i++) {
				wpLatLng = wps[i].latLng;
				routeCoord = L.latLng(this._route.coordinates[wpIndices[i]]);
				if (wpLatLng.distanceTo(routeCoord) >
					this.options.missingRouteTolerance) {
					this._addSegment([wpLatLng, routeCoord],
						this.options.missingRouteStyles);
				}
			}
		},

		_addSegment: function(coords, styles, mouselistener) {
			var i,
				pl;

			for (i = 0; i < styles.length; i++) {
				pl = L.polyline(coords, styles[i]);
				this.addLayer(pl);
				if (mouselistener) {
					pl.on('mousedown', this._onLineTouched, this);
				}
			}
		},

		_findNearestWpBefore: function(i) {
			var wpIndices = this._getWaypointIndices(),
				j = wpIndices.length - 1;
			while (j >= 0 && wpIndices[j] > i) {
				j--;
			}

			return j;
		},

		_onLineTouched: function(e) {
			var afterIndex = this._findNearestWpBefore(this._findClosestRoutePoint(e.latlng));
			this.fire('linetouched', {
				afterIndex: afterIndex,
				latlng: e.latlng
			});
		},

		_getWaypointIndices: function() {
			if (!this._wpIndices) {
				this._wpIndices = this._route.waypointIndices || this._findWaypointIndices();
			}

			return this._wpIndices;
		}
	});

	L.Routing.line = function(route, options) {
		return new L.Routing.Line(route, options);
	};

	module.exports = L.Routing;
})();

},{"leaflet":11}],19:[function(require,module,exports){
(function() {
	'use strict';
	L.Routing = L.Routing || {};

	L.Routing.Localization = {
		'en': {
			directions: {
				N: 'north',
				NE: 'northeast',
				E: 'east',
				SE: 'southeast',
				S: 'south',
				SW: 'southwest',
				W: 'west',
				NW: 'northwest'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Head {dir}', ' on {road}'],
				'Continue':
					['Continue {dir}', ' on {road}'],
				'SlightRight':
					['Slight right', ' onto {road}'],
				'Right':
					['Right', ' onto {road}'],
				'SharpRight':
					['Sharp right', ' onto {road}'],
				'TurnAround':
					['Turn around'],
				'SharpLeft':
					['Sharp left', ' onto {road}'],
				'Left':
					['Left', ' onto {road}'],
				'SlightLeft':
					['Slight left', ' onto {road}'],
				'WaypointReached':
					['Waypoint reached'],
				'Roundabout':
					['Take the {exitStr} exit in the roundabout', ' onto {road}'],
				'DestinationReached':
					['Destination reached'],
			},
			formatOrder: function(n) {
				var i = n % 10 - 1,
				suffix = ['st', 'nd', 'rd'];

				return suffix[i] ? n + suffix[i] : n + 'th';
			}
		},

		'de': {
			directions: {
				N: 'Norden',
				NE: 'Nordosten',
				E: 'Osten',
				SE: 'Südosten',
				S: 'Süden',
				SW: 'Südwesten',
				W: 'Westen',
				NW: 'Nordwesten'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Richtung {dir}', ' auf {road}'],
				'Continue':
					['Geradeaus Richtung {dir}', ' auf {road}'],
				'SlightRight':
					['Leicht rechts abbiegen', ' auf {road}'],
				'Right':
					['Rechts abbiegen', ' auf {road}'],
				'SharpRight':
					['Scharf rechts abbiegen', ' auf {road}'],
				'TurnAround':
					['Wenden'],
				'SharpLeft':
					['Scharf links abbiegen', ' auf {road}'],
				'Left':
					['Links abbiegen', ' auf {road}'],
				'SlightLeft':
					['Leicht links abbiegen', ' auf {road}'],
				'WaypointReached':
					['Zwischenhalt erreicht'],
				'Roundabout':
					['Nehmen Sie die {exitStr} Ausfahrt im Kreisverkehr', ' auf {road}'],
				'DestinationReached':
					['Sie haben ihr Ziel erreicht'],
			},
			formatOrder: function(n) {
				return n + '.';
			}
		},

		'sv': {
			directions: {
				N: 'norr',
				NE: 'nordost',
				E: 'öst',
				SE: 'sydost',
				S: 'syd',
				SW: 'sydväst',
				W: 'väst',
				NW: 'nordväst'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Åk åt {dir}', ' på {road}'],
				'Continue':
					['Fortsätt {dir}', ' på {road}'],
				'SlightRight':
					['Svagt höger', ' på {road}'],
				'Right':
					['Sväng höger', ' på {road}'],
				'SharpRight':
					['Skarpt höger', ' på {road}'],
				'TurnAround':
					['Vänd'],
				'SharpLeft':
					['Skarpt vänster', ' på {road}'],
				'Left':
					['Sväng vänster', ' på {road}'],
				'SlightLeft':
					['Svagt vänster', ' på {road}'],
				'WaypointReached':
					['Viapunkt nådd'],
				'Roundabout':
					['Tag {exitStr} avfarten i rondellen', ' till {road}'],
				'DestinationReached':
					['Framme vid resans mål'],
			},
			formatOrder: function(n) {
				return ['första', 'andra', 'tredje', 'fjärde', 'femte',
					'sjätte', 'sjunde', 'åttonde', 'nionde', 'tionde'
					/* Can't possibly be more than ten exits, can there? */][n - 1];
			}
		},

		'sp': {
			directions: {
				N: 'norte',
				NE: 'noreste',
				E: 'este',
				SE: 'sureste',
				S: 'sur',
				SW: 'suroeste',
				W: 'oeste',
				NW: 'noroeste'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Derecho {dir}', ' sobre {road}'],
				'Continue':
					['Continuar {dir}', ' en {road}'],
				'SlightRight':
					['Leve giro a la derecha', ' sobre {road}'],
				'Right':
					['Derecha', ' sobre {road}'],
				'SharpRight':
					['Giro pronunciado a la derecha', ' sobre {road}'],
				'TurnAround':
					['Dar vuelta'],
				'SharpLeft':
					['Giro pronunciado a la izquierda', ' sobre {road}'],
				'Left':
					['Izquierda', ' en {road}'],
				'SlightLeft':
					['Leve giro a la izquierda', ' en {road}'],
				'WaypointReached':
					['Llegó a un punto del camino'],
				'Roundabout':
					['Tomar {exitStr} salida en la rotonda', ' en {road}'],
				'DestinationReached':
					['Llegada a destino'],
			},
			formatOrder: function(n) {
				return n + 'º';
			}
		},
		'nl': {
			directions: {
				N: 'noordelijke',
				NE: 'noordoostelijke',
				E: 'oostelijke',
				SE: 'zuidoostelijke',
				S: 'zuidelijke',
				SW: 'zuidewestelijke',
				W: 'westelijke',
				NW: 'noordwestelijke'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Vertrek in {dir} richting', ' de {road} op'],
				'Continue':
					['Ga in {dir} richting', ' de {road} op'],
				'SlightRight':
					['Volg de weg naar rechts', ' de {road} op'],
				'Right':
					['Ga rechtsaf', ' de {road} op'],
				'SharpRight':
					['Ga scherpe bocht naar rechts', ' de {road} op'],
				'TurnAround':
					['Keer om'],
				'SharpLeft':
					['Ga scherpe bocht naar links', ' de {road} op'],
				'Left':
					['Ga linksaf', ' de {road} op'],
				'SlightLeft':
					['Volg de weg naar links', ' de {road} op'],
				'WaypointReached':
					['Aangekomen bij tussenpunt'],
				'Roundabout':
					['Neem de {exitStr} afslag op de rotonde', ' de {road} op'],
				'DestinationReached':
					['Aangekomen op eindpunt'],
			},
			formatOrder: function(n) {
				if (n == 1 || n >= 20) {
					return n + "ste";
				} else {
					return n + "de";
				}
			}
		},
		'fr': {
			directions: {
				N: 'nord',
				NE: 'nord-est',
				E: 'est',
				SE: 'sud-est',
				S: 'sud',
				SW: 'sud-ouest',
				W: 'ouest',
				NW: 'nord-ouest'
			},
			instructions: {
				// instruction, postfix if the road is named
				'Head':
					['Tout droit au {dir}', ' sur {road}'],
				'Continue':
					['Continuer au {dir}', ' sur {road}'],
				'SlightRight':
					['Légèrement à droite', ' sur {road}'],
				'Right':
					['A droite', ' sur {road}'],
				'SharpRight':
					['Complètement à droite', ' sur {road}'],
				'TurnAround':
					['Faire demi-tour'],
				'SharpLeft':
					['Complètement à gauche', ' sur {road}'],
				'Left':
					['A gauche', ' sur {road}'],
				'SlightLeft':
					['Légèrement à gauche', ' sur {road}'],
				'WaypointReached':
					['Point d\'étape atteint'],
				'Roundabout':
					['Au rond-point, prenez la {exitStr} sortie', ' sur {road}'],
				'DestinationReached':
					['Destination atteinte'],
			},
			formatOrder: function(n) {
				return n + 'º';
			}
		}
	};

	module.exports = L.Routing;
})();

},{}],20:[function(require,module,exports){
(function() {
	'use strict';

	var L = require('leaflet'),
		corslite = require('corslite'),
		polyline = require('polyline');

	// Ignore camelcase naming for this file, since OSRM's API uses
	// underscores.
	/* jshint camelcase: false */

	L.Routing = L.Routing || {};
	L.extend(L.Routing, require('./L.Routing.Waypoint'));

	L.Routing.OSRM = L.Class.extend({
		options: {
			serviceUrl: '//router.project-osrm.org/viaroute',
			timeout: 30 * 1000
		},

		initialize: function(options) {
			L.Util.setOptions(this, options);
			this._hints = {
				locations: {}
			};
		},

		route: function(waypoints, callback, context, options) {
			var timedOut = false,
				wps = [],
				url,
				timer,
				wp,
				i;

			options = options || {};
			url = this.buildRouteUrl(waypoints, options);

			timer = setTimeout(function() {
				timedOut = true;
				callback.call(context || callback, {
					status: -1,
					message: 'OSRM request timed out.'
				});
			}, this.options.timeout);

			// Create a copy of the waypoints, since they
			// might otherwise be asynchronously modified while
			// the request is being processed.
			for (i = 0; i < waypoints.length; i++) {
				wp = waypoints[i];
				wps.push(new L.Routing.Waypoint(wp.latLng, wp.name, wp.options));
			}

			corslite(url, L.bind(function(err, resp) {
				var data;

				clearTimeout(timer);
				if (!timedOut) {
					if (!err) {
						data = JSON.parse(resp.responseText);
						this._routeDone(data, wps, callback, context);
					} else {
						callback.call(context || callback, {
							status: -1,
							message: 'HTTP request failed: ' + err
						});
					}
				}
			}, this));

			return this;
		},

		_routeDone: function(response, inputWaypoints, callback, context) {
			var coordinates,
			    alts,
			    actualWaypoints,
			    i;

			context = context || callback;
			if (response.status !== 0) {
				callback.call(context, {
					status: response.status,
					message: response.status_message
				});
				return;
			}

			coordinates = polyline.decode(response.route_geometry, 6);
			actualWaypoints = this._toWaypoints(inputWaypoints, response.via_points);
			alts = [{
				name: response.route_name.join(', '),
				coordinates: coordinates,
				instructions: response.route_instructions ? this._convertInstructions(response.route_instructions) : [],
				summary: response.route_summary ? this._convertSummary(response.route_summary) : [],
				inputWaypoints: inputWaypoints,
				waypoints: actualWaypoints,
				waypointIndices: this._clampIndices(response.via_indices, coordinates)
			}];

			if (response.alternative_geometries) {
				for (i = 0; i < response.alternative_geometries.length; i++) {
					coordinates = polyline.decode(response.alternative_geometries[i], 6);
					alts.push({
						name: response.alternative_names[i].join(', '),
						coordinates: coordinates,
						instructions: response.alternative_instructions[i] ? this._convertInstructions(response.alternative_instructions[i]) : [],
						summary: response.alternative_summaries[i] ? this._convertSummary(response.alternative_summaries[i]) : [],
						inputWaypoints: inputWaypoints,
						waypoints: actualWaypoints,
						waypointIndices: this._clampIndices(response.alternative_geometries.length === 1 ?
							// Unsure if this is a bug in OSRM or not, but alternative_indices
							// does not appear to be an array of arrays, at least not when there is
							// a single alternative route.
							response.alternative_indices : response.alternative_indices[i],
							coordinates)
					});
				}
			}

			// only versions <4.5.0 will support this flag
			if (response.hint_data) {
				this._saveHintData(response.hint_data, inputWaypoints);
			}
			callback.call(context, null, alts);
		},

		_toWaypoints: function(inputWaypoints, vias) {
			var wps = [],
			    i;
			for (i = 0; i < vias.length; i++) {
				wps.push(L.Routing.waypoint(L.latLng(vias[i]),
				                            inputWaypoints[i].name,
				                            inputWaypoints[i].options));
			}

			return wps;
		},

		buildRouteUrl: function(waypoints, options) {
			var locs = [],
				wp,
			    computeInstructions,
			    computeAlternative,
			    locationKey,
			    hint;

			for (var i = 0; i < waypoints.length; i++) {
				wp = waypoints[i];
				locationKey = this._locationKey(wp.latLng);
				locs.push('loc=' + locationKey);

				hint = this._hints.locations[locationKey];
				if (hint) {
					locs.push('hint=' + hint);
				}

				if (wp.options && wp.options.allowUTurn) {
					locs.push('u=true');
				}
			}

			computeAlternative = computeInstructions =
				!(options && options.geometryOnly);

			return this.options.serviceUrl + '?' +
				'instructions=' + computeInstructions + '&' +
				'alt=' + computeAlternative + '&' +
				(options.z ? 'z=' + options.z + '&' : '') +
				locs.join('&') +
				(this._hints.checksum !== undefined ? '&checksum=' + this._hints.checksum : '') +
				(options.fileformat ? '&output=' + options.fileformat : '') +
				(options.allowUTurns ? '&uturns=' + options.allowUTurns : '');
		},

		_locationKey: function(location) {
			return location.lat + ',' + location.lng;
		},

		_saveHintData: function(hintData, waypoints) {
			var loc;
			this._hints = {
				checksum: hintData.checksum,
				locations: {}
			};
			for (var i = hintData.locations.length - 1; i >= 0; i--) {
				loc = waypoints[i].latLng;
				this._hints.locations[this._locationKey(loc)] = hintData.locations[i];
			}
		},

		// Adapted from
		// https://github.com/DennisSchiefer/Project-OSRM-Web/blob/develop/WebContent/routing/OSRM.RoutingGeometry.js
		_decode: function(encoded, precision) {
			var len = encoded.length,
			    index=0,
			    lat=0,
			    lng = 0,
			    array = [];

			precision = Math.pow(10, -precision);

			while (index < len) {
				var b,
				    shift = 0,
				    result = 0;
				do {
					b = encoded.charCodeAt(index++) - 63;
					result |= (b & 0x1f) << shift;
					shift += 5;
				} while (b >= 0x20);
				var dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
				lat += dlat;
				shift = 0;
				result = 0;
				do {
					b = encoded.charCodeAt(index++) - 63;
					result |= (b & 0x1f) << shift;
					shift += 5;
				} while (b >= 0x20);
				var dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
				lng += dlng;
				//array.push( {lat: lat * precision, lng: lng * precision} );
				array.push( [lat * precision, lng * precision] );
			}
			return array;
		},

		_convertSummary: function(osrmSummary) {
			return {
				totalDistance: osrmSummary.total_distance,
				totalTime: osrmSummary.total_time
			};
		},

		_convertInstructions: function(osrmInstructions) {
			var result = [],
			    i,
			    instr,
			    type,
			    driveDir;

			for (i = 0; i < osrmInstructions.length; i++) {
				instr = osrmInstructions[i];
				type = this._drivingDirectionType(instr[0]);
				driveDir = instr[0].split('-');
				if (type) {
					result.push({
						type: type,
						distance: instr[2],
						time: instr[4],
						road: instr[1],
						direction: instr[6],
						exit: driveDir.length > 1 ? driveDir[1] : undefined,
						index: instr[3]
					});
				}
			}

			return result;
		},

		_drivingDirectionType: function(d) {
			switch (parseInt(d, 10)) {
			case 1:
				return 'Straight';
			case 2:
				return 'SlightRight';
			case 3:
				return 'Right';
			case 4:
				return 'SharpRight';
			case 5:
				return 'TurnAround';
			case 6:
				return 'SharpLeft';
			case 7:
				return 'Left';
			case 8:
				return 'SlightLeft';
			case 9:
				return 'WaypointReached';
			case 10:
				// TODO: "Head on"
				// https://github.com/DennisOSRM/Project-OSRM/blob/master/DataStructures/TurnInstructions.h#L48
				return 'Straight';
			case 11:
			case 12:
				return 'Roundabout';
			case 15:
				return 'DestinationReached';
			default:
				return null;
			}
		},

		_clampIndices: function(indices, coords) {
			var maxCoordIndex = coords.length - 1,
				i;
			for (i = 0; i < indices.length; i++) {
				indices[i] = Math.min(maxCoordIndex, Math.max(indices[i], 0));
			}
		}
	});

	L.Routing.osrm = function(options) {
		return new L.Routing.OSRM(options);
	};

	module.exports = L.Routing;
})();

},{"./L.Routing.Waypoint":22,"corslite":10,"leaflet":11,"polyline":12}],21:[function(require,module,exports){
(function() {
	'use strict';

	var L = require('leaflet');
	L.Routing = L.Routing || {};
	L.extend(L.Routing, require('./L.Routing.Autocomplete'));
	L.extend(L.Routing, require('./L.Routing.Waypoint'));

	function selectInputText(input) {
		if (input.setSelectionRange) {
			// On iOS, select() doesn't work
			input.setSelectionRange(0, 9999);
		} else {
			// On at least IE8, setSeleectionRange doesn't exist
			input.select();
		}
	}

	L.Routing.Plan = L.Class.extend({
		includes: L.Mixin.Events,

		options: {
			dragStyles: [
				{color: 'black', opacity: 0.15, weight: 9},
				{color: 'white', opacity: 0.8, weight: 6},
				{color: 'red', opacity: 1, weight: 2, dashArray: '7,12'}
			],
			draggableWaypoints: true,
			routeWhileDragging: false,
			addWaypoints: true,
			reverseWaypoints: false,
			addButtonClassName: '',
			maxGeocoderTolerance: 200,
			autocompleteOptions: {},
			geocodersClassName: '',
			geocoderPlaceholder: function(i, numberWaypoints) {
				return i === 0 ?
					'Start' :
					(i < numberWaypoints - 1 ?
									'Via ' + i :
									'End');
			},
			geocoderClass: function() {
				return '';
			},
			createGeocoder: function() {
				var container = L.DomUtil.create('div', 'leaflet-routing-geocoder'),
					input = L.DomUtil.create('input', '', container),
					remove = L.DomUtil.create('span', 'leaflet-routing-remove-waypoint', container);

				return {
					container: container,
					input: input,
					closeButton: remove
				};
			},
			createMarker: function(i, wp) {
				var options = {
						draggable: this.draggableWaypoints
					},
				    marker = L.marker(wp.latLng, options);

				return marker;
			},
			waypointNameFallback: function(latLng) {
				var ns = latLng.lat < 0 ? 'S' : 'N',
				    ew = latLng.lng < 0 ? 'W' : 'E',
				    lat = (Math.round(Math.abs(latLng.lat) * 10000) / 10000).toString(),
				    lng = (Math.round(Math.abs(latLng.lng) * 10000) / 10000).toString();
				return ns + lat + ', ' + ew + lng;
			}
		},

		initialize: function(waypoints, options) {
			L.Util.setOptions(this, options);
			this._waypoints = [];
			this.setWaypoints(waypoints);
		},

		isReady: function() {
			var i;
			for (i = 0; i < this._waypoints.length; i++) {
				if (!this._waypoints[i].latLng) {
					return false;
				}
			}

			return true;
		},

		getWaypoints: function() {
			var i,
				wps = [];

			for (i = 0; i < this._waypoints.length; i++) {
				wps.push(this._waypoints[i]);
			}

			return wps;
		},

		setWaypoints: function(waypoints) {
			var args = [0, this._waypoints.length].concat(waypoints);
			this.spliceWaypoints.apply(this, args);
			return this;
		},

		spliceWaypoints: function() {
			var args = [arguments[0], arguments[1]],
			    i;

			for (i = 2; i < arguments.length; i++) {
				args.push(arguments[i] && arguments[i].hasOwnProperty('latLng') ? arguments[i] : L.Routing.waypoint(arguments[i]));
			}

			[].splice.apply(this._waypoints, args);

			this._updateMarkers();
			this._fireChanged.apply(this, args);

			// Make sure there's always at least two waypoints
			while (this._waypoints.length < 2) {
				this.spliceWaypoints(this._waypoints.length, 0, null);
			}
		},

		onAdd: function(map) {
			this._map = map;
			this._updateMarkers();
		},

		onRemove: function() {
			var i;
			this._removeMarkers();

			if (this._newWp) {
				for (i = 0; i < this._newWp.lines.length; i++) {
					this._map.removeLayer(this._newWp.lines[i]);
				}
			}

			delete this._map;
		},

		createGeocoders: function() {
			var container = L.DomUtil.create('div', 'leaflet-routing-geocoders ' + this.options.geocodersClassName),
				waypoints = this._waypoints,
			    addWpBtn,
			    reverseBtn;

			this._geocoderContainer = container;
			this._geocoderElems = [];


			if (this.options.addWaypoints) {
				addWpBtn = L.DomUtil.create('button', 'leaflet-routing-add-waypoint ' + this.options.addButtonClassName, container);
				addWpBtn.setAttribute('type', 'button');
				L.DomEvent.addListener(addWpBtn, 'click', function() {
					this.spliceWaypoints(waypoints.length, 0, null);
				}, this);
			}

			if (this.options.reverseWaypoints) {
				reverseBtn = L.DomUtil.create('button', 'leaflet-routing-reverse-waypoints', container);
				reverseBtn.setAttribute('type', 'button');
				L.DomEvent.addListener(reverseBtn, 'click', function() {
					this._waypoints.reverse();
					this.setWaypoints(this._waypoints);
				}, this);
			}

			this._updateGeocoders();
			this.on('waypointsspliced', this._updateGeocoders);

			return container;
		},

		_createGeocoder: function(i) {
			var nWps = this._waypoints.length,
				g = this.options.createGeocoder(i, nWps),
				closeButton = g.closeButton,
				geocoderInput = g.input,
				wp = this._waypoints[i];
			geocoderInput.setAttribute('placeholder', this.options.geocoderPlaceholder(i, nWps));
			geocoderInput.className = this.options.geocoderClass(i, nWps);

			this._updateWaypointName(i, geocoderInput);
			// This has to be here, or geocoder's value will not be properly
			// initialized.
			// TODO: look into why and make _updateWaypointName fix this.
			geocoderInput.value = wp.name;

			L.DomEvent.addListener(geocoderInput, 'click', function() {
				selectInputText(this);
			}, geocoderInput);

			if (closeButton) {
				L.DomEvent.addListener(closeButton, 'click', function() {
					if (i > 0 || this._waypoints.length > 2) {
						this.spliceWaypoints(i, 1);
					} else {
						this.spliceWaypoints(i, 1, new L.Routing.Waypoint());
					}
				}, this);
			}

			new L.Routing.Autocomplete(geocoderInput, function(r) {
					geocoderInput.value = r.name;
					wp.name = r.name;
					wp.latLng = r.center;
					this._updateMarkers();
					this._fireChanged();
					this._focusGeocoder(i + 1);
				}, this, L.extend({
					resultFn: this.options.geocoder.geocode,
					resultContext: this.options.geocoder,
					autocompleteFn: this.options.geocoder.suggest,
					autocompleteContext: this.options.geocoder
				}, this.options.autocompleteOptions));

			return g;
		},

		_updateGeocoders: function() {
			var elems = [],
				i,
			    geocoderElem;

			for (i = 0; i < this._geocoderElems.length; i++) {
				this._geocoderContainer.removeChild(this._geocoderElems[i].container);
			}

			for (i = this._waypoints.length - 1; i >= 0; i--) {
				geocoderElem = this._createGeocoder(i);
				this._geocoderContainer.insertBefore(geocoderElem.container, this._geocoderContainer.firstChild);
				elems.push(geocoderElem);
			}

			this._geocoderElems = elems.reverse();
		},

		_updateGeocoder: function(i, geocoderElem) {
			var wp = this._waypoints[i],
			    value = wp && wp.name ? wp.name : '';
			if (geocoderElem) {
				geocoderElem.value = value;
			}
		},

		_updateWaypointName: function(i, geocoderElem, force) {
			var wp = this._waypoints[i],
					wpCoords;

			wp.name = wp.name || '';

			if (wp.latLng && (force || !wp.name)) {
				wpCoords = this.options.waypointNameFallback(wp.latLng);
				if (this.options.geocoder && this.options.geocoder.reverse) {
					this.options.geocoder.reverse(wp.latLng, 67108864 /* zoom 18 */, function(rs) {
						if (rs.length > 0 && rs[0].center.distanceTo(wp.latLng) < this.options.maxGeocoderTolerance) {
							wp.name = rs[0].name;
						} else {
							wp.name = wpCoords;
						}
						this._updateGeocoder(i, geocoderElem);
					}, this);
				} else {
					wp.name = wpCoords;
				}

				this._updateGeocoder(i, geocoderElem);
			}

		},

		_removeMarkers: function() {
			var i;
			if (this._markers) {
				for (i = 0; i < this._markers.length; i++) {
					if (this._markers[i]) {
						this._map.removeLayer(this._markers[i]);
					}
				}
			}
			this._markers = [];
		},

		_updateMarkers: function() {
			var i,
			    m;

			if (!this._map) {
				return;
			}

			this._removeMarkers();

			for (i = 0; i < this._waypoints.length; i++) {
				if (this._waypoints[i].latLng) {
					m = this.options.createMarker(i, this._waypoints[i], this._waypoints.length);
					if (m) {
						m.addTo(this._map);
						if (this.options.draggableWaypoints) {
							this._hookWaypointEvents(m, i);
						}
					}
				} else {
					m = null;
				}
				this._markers.push(m);
			}
		},

		_fireChanged: function() {
			this.fire('waypointschanged', {waypoints: this.getWaypoints()});

			if (arguments.length >= 2) {
				this.fire('waypointsspliced', {
					index: Array.prototype.shift.call(arguments),
					nRemoved: Array.prototype.shift.call(arguments),
					added: arguments
				});
			}
		},

		_hookWaypointEvents: function(m, i, trackMouseMove) {
			var eventLatLng = function(e) {
					return trackMouseMove ? e.latlng : e.target.getLatLng();
				},
				dragStart = L.bind(function(e) {
					this.fire('waypointdragstart', {index: i, latlng: eventLatLng(e)});
				}, this),
				drag = L.bind(function(e) {
					this._waypoints[i].latLng = eventLatLng(e);
					this.fire('waypointdrag', {index: i, latlng: eventLatLng(e)});
				}, this),
				dragEnd = L.bind(function(e) {
					this._waypoints[i].latLng = eventLatLng(e);
					this._waypoints[i].name = '';
					this._updateWaypointName(i, this._geocoderElems && this._geocoderElems[i].input, true);
					this.fire('waypointdragend', {index: i, latlng: eventLatLng(e)});
					this._fireChanged();
				}, this),
				mouseMove,
				mouseUp;

			if (trackMouseMove) {
				mouseMove = L.bind(function(e) {
					this._markers[i].setLatLng(e.latlng);
					drag(e);
				}, this);
				mouseUp = L.bind(function(e) {
					this._map.dragging.enable();
					this._map.off('mouseup', mouseUp);
					this._map.off('mousemove', mouseMove);
					dragEnd(e);
				}, this);
				this._map.dragging.disable();
				this._map.on('mousemove', mouseMove);
				this._map.on('mouseup', mouseUp);
				dragStart({latlng: this._waypoints[i].latLng});
			} else {
				m.on('dragstart', dragStart);
				m.on('drag', drag);
				m.on('dragend', dragEnd);
			}
		},

		dragNewWaypoint: function(e) {
			var newWpIndex = e.afterIndex + 1;
			if (this.options.routeWhileDragging) {
				this.spliceWaypoints(newWpIndex, 0, e.latlng);
				this._hookWaypointEvents(this._markers[newWpIndex], newWpIndex, true);
			} else {
				this._dragNewWaypoint(newWpIndex, e.latlng);
			}
		},

		_dragNewWaypoint: function(newWpIndex, initialLatLng) {
			var wp = new L.Routing.Waypoint(initialLatLng),
				prevWp = this._waypoints[newWpIndex - 1],
				nextWp = this._waypoints[newWpIndex],
				marker = this.options.createMarker(newWpIndex, wp, this._waypoints.length + 1),
				lines = [],
				mouseMove = L.bind(function(e) {
					var i;
					if (marker) {
						marker.setLatLng(e.latlng);
					}
					for (i = 0; i < lines.length; i++) {
						lines[i].spliceLatLngs(1, 1, e.latlng);
					}
				}, this),
				mouseUp = L.bind(function(e) {
					var i;
					if (marker) {
						this._map.removeLayer(marker);
					}
					for (i = 0; i < lines.length; i++) {
						this._map.removeLayer(lines[i]);
					}
					this._map.off('mousemove', mouseMove);
					this._map.off('mouseup', mouseUp);
					this.spliceWaypoints(newWpIndex, 0, e.latlng);
				}, this),
				i;

			if (marker) {
				marker.addTo(this._map);
			}

			for (i = 0; i < this.options.dragStyles.length; i++) {
				lines.push(L.polyline([prevWp.latLng, initialLatLng, nextWp.latLng],
					this.options.dragStyles[i]).addTo(this._map));
			}

			this._map.on('mousemove', mouseMove);
			this._map.on('mouseup', mouseUp);
		},

		_focusGeocoder: function(i) {
			var input;
			if (this._geocoderElems[i]) {
				input = this._geocoderElems[i].input;
				input.focus();
				selectInputText(input);
			} else {
				document.activeElement.blur();
			}
		}
	});

	L.Routing.plan = function(waypoints, options) {
		return new L.Routing.Plan(waypoints, options);
	};

	module.exports = L.Routing;
})();

},{"./L.Routing.Autocomplete":13,"./L.Routing.Waypoint":22,"leaflet":11}],22:[function(require,module,exports){
(function() {
	'use strict';

	var L = require('leaflet');
	L.Routing = L.Routing || {};

	L.Routing.Waypoint = L.Class.extend({
			options: {
				allowUTurn: false,
			},
			initialize: function(latLng, name, options) {
				L.Util.setOptions(this, options);
				this.latLng = latLng;
				this.name = name;
			}
		});

	L.Routing.waypoint = function(latLng, name, options) {
		return new L.Routing.Waypoint(latLng, name, options);
	};

	module.exports = L.Routing;
})();

},{"leaflet":11}],23:[function(require,module,exports){
'use strict';
/* global L */

var LRM = require('leaflet-routing-machine');
var links = require('./src/links');
var mapView = require('./src/leaflet_options');

var parsedOptions = links.parse(window.location.hash);
var viewOptions = L.extend(mapView.defaultView, parsedOptions);

var map = L.map('map', {
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    touchZoom: false,
    doubleClickZoom: false
  }
  ).setView(parsedOptions.center, viewOptions.zoom);

L.tileLayer('https://{s}.tiles.mapbox.com/v4/'+mapView.defaultView.layer+'/{z}/{x}/{y}@2x.png?access_token=pk.eyJ1IjoibXNsZWUiLCJhIjoiclpiTWV5SSJ9.P_h8r37vD8jpIH1A6i1VRg', {
	attribution: 'Maps by <a href="https://www.mapbox.com/about/maps/">Mapbox</a>. ' +
		'Routes from <a href="http://project-osrm.org/">OSRM</a>, ' +
		'data uses <a href="http://opendatacommons.org/licenses/odbl/">ODbL</a> license'
}).addTo(map);

var osrm = L.Routing.osrm();
var itinerary = L.Routing.itinerary({language: viewOptions.language});
var itineraryContainer = itinerary.onAdd(map);

document.getElementById("instructions").appendChild(itineraryContainer);

osrm.route(viewOptions.waypoints, function(error, alts) {
  var line = L.Routing.line(alts[alts.length - 1], {});

  line.addTo(map);
  map.fitBounds(line.getBounds());

  viewOptions.waypoints.map(function (wp) {
    L.marker(wp.latLng).addTo(map);
  });

  itinerary.setAlternatives(alts);
}, null, {});

},{"./src/leaflet_options":24,"./src/links":25,"leaflet-routing-machine":14}],24:[function(require,module,exports){
'use strict';

module.exports = {
  defaultView: {
    centerLat: 38.8995,
    centerLng: -77.0269,
    center: L.latLng(38.8995,-77.0269),
    zoom: 13,
    waypoints: [],
    language: 'en',
    alternative: true,
	// best way to pass??
    layer: 'mapbox.emerald'
  },

  services: [
    {
      label: 'Car (fastest)',
      path: '//router.project-osrm.org/viaroute'
    }
  ],

  layer: [
    {
      label: 'Mapbox Emerald',
      tileLayer: 'http://api.tiles.mapbox.com/v4/mapbox.emerald/{z}/{x}/{y}@2x.png?access_token=pk.eyJ1IjoibXNsZWUiLCJhIjoiclpiTWV5SSJ9.P_h8r37vD8jpIH1A6i1VRg',
      attribution: '<a href="https://www.mapbox.com/about/maps">© Mapbox</a> <a href="http://openstreetmap.org/copyright">© OpenStreetMap</a> | <a href="http://mapbox.com/map-feedback/">Improve this map</a>',
      maxZoom: 18
    },
    {
      label: 'Mapbox Streets',
      tileLayer: 'http://api.tiles.mapbox.com/v4/mapbox.streets/{z}/{x}/{y}@2x.png?access_token=pk.eyJ1IjoibXNsZWUiLCJhIjoiclpiTWV5SSJ9.P_h8r37vD8jpIH1A6i1VRg',
      attribution: '<a href="https://www.mapbox.com/about/maps">© Mapbox</a> <a href="http://openstreetmap.org/copyright">© OpenStreetMap</a> | <a href="http://mapbox.com/map-feedback/">Improve this map</a>',
      maxZoom: 18
    },
    {
      label: 'Mapbox Outdoors',
      tileLayer: 'http://api.tiles.mapbox.com/v4/mapbox.outdoors/{z}/{x}/{y}@2x.png?access_token=pk.eyJ1IjoibXNsZWUiLCJhIjoiclpiTWV5SSJ9.P_h8r37vD8jpIH1A6i1VRg',
      attribution:'<a href="https://www.mapbox.com/about/maps">© Mapbox</a> <a href="http://openstreetmap.org/copyright">© OpenStreetMap</a> | <a href="http://mapbox.com/map-feedback/">Improve this map</a>',
      maxZoom: 18
    },
    {
      label: 'Mapbox Streets Satellite',
      tileLayer: 'http://api.tiles.mapbox.com/v4/mapbox.streets-satellite/{z}/{x}/{y}@2x.png?access_token=pk.eyJ1IjoibXNsZWUiLCJhIjoiclpiTWV5SSJ9.P_h8r37vD8jpIH1A6i1VRg',
      attribution:'<a href="https://www.mapbox.com/about/maps">© Mapbox</a> <a href="http://openstreetmap.org/copyright">© OpenStreetMap</a> | <a href="http://mapbox.com/map-feedback/">Improve this map</a>',
      maxZoom: 18
    },
    {
      label: 'osm.org',
      tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© <a href="http://www.openstreetmap.org/copyright/en">OpenStreetMap</a> contributors',
      maxZoom: 18
    },
    {
      label: 'osm.de',
      tileLayer: 'http://{s}.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png',
      attribution: '© <a href="http://www.openstreetmap.org/copyright/en">OpenStreetMap</a> contributors',
      maxZoom: 18
    }
  ]

};


},{}],25:[function(require,module,exports){
"use strict";

var url = require('url'),
    jsonp = require('jsonp');

function _formatCoord(latLng)
{
  var precision = 6;
  if (!latLng) {
   return
}
  // console.log(latLng);
  // read the var ^
  // console.log(typeof latLng.lat.toFixed(precision));
  // console.log(latLng.lat.toFixed(precision));
  // check what type of value it is ^

  return latLng.lat.toFixed(precision) + "," + latLng.lng.toFixed(precision);

}

// console.log(_formatCoord({lat: 32.333, lng: 14.12}));
  // pass value to return


function _parseCoord(coordStr)
{
  var latLng = coordStr.split(','),
      lat = parseFloat(latLng[0]),
      lon = parseFloat(latLng[1]);

// console.log(latLng)
  if (isNaN(lat) || isNaN(lon)) {
    throw {name: 'InvalidCoords', message: "\"" + coordStr + "\" is not a valid coordinate."};
  }

  return L.latLng(lat,lon);
}

// console.log(_parseCoord.coordStr);
// console.log(coordStr);
// console.log(_parseCoord({lat: 32.333, lng: 14.12}));

function _parseInteger(intStr)
{
  var integer = parseInt(intStr);

  if (isNaN(integer)) {
    throw {name: 'InvalidInt', message: "\"" + intStr + "\" is not a valid integer."};
  }

  return integer;
}

function formatLink(baseURL, options)
{
  var parsed = url.parse(baseURL),
      formated = url.format({
        protocol: parsed.protocol,
        host: parsed.host,
        pathname: parsed.pathname,
        query: {
          z: options.zoom,
          center: options.center ? _formatCoord(options.center) : undefined,
          loc: options.waypoints ? options.waypoints.filter(function(wp) { return wp.latLng !== undefined;})
                                                    .map(function(wp) {return wp.latLng;})
                                                    .map(_formatCoord)
                                 : undefined,
          hl: options.language,
          ly: options.layer,
          alt: options.alternative,
          df: options.units,
          srv: options.service,
        },
      });
	// no layer, no service
  return formated;
}

function parseLink(link)
{
  link = '?' + link.slice(1);

  var parsed = url.parse(link, true),
      q = parsed.query,
      parsedValues = {},
      options = {},
      k;

  try {
    parsedValues.zoom      = q.zoom   && _parseInteger(q.zoom);
    parsedValues.center    = q.center && _parseCoord(q.center);
	// console.log(q.loc);
    parsedValues.waypoints = q.loc    && q.loc.map(_parseCoord).map(
      function (coord) {
        // console.log(coord);
        return L.Routing.waypoint(coord);
      }
    );
    parsedValues.language = q.hl;
    parsedValues.alternative = q.alt;
    parsedValues.units = q.df;
    parsedValues.layer = q.ly;
    parsedValues.service = q.srv;
  } catch (e) {
    console.log("Exception " + e.name + ": " + e.message);
  }

  for (k in parsedValues)
  {
    if (parsedValues[k] !== undefined && parsedValues[k] !== "")
    {
      options[k] = parsedValues[k];
    }
  }

  return options;
}

var Shortener = L.Class.extend({
  options: {
    baseURL: 'http://short.project-osrm.org/'
  },

  initialize: function(options) {
    L.Util.setOptions(this, options);
  },

  shorten: function(link, callback, context) {
    var requestURL = this.options.baseURL + link;
    jsonp(requestURL, {param: 'jsonp'},
      function(error, resp) {
        if (error) {
          console.log("Error: " + error);
          callback.call(context, "");
          return;
        }
        if (resp.ShortURL === undefined)
        {
          console.log("Error: " + resp.Error);
          callback.call(context, "");
          return;
        }
        callback.call(context, resp.ShortURL);
      }
    );
  }

});

module.exports = {
  'parse': parseLink,
  'format': formatLink,
  'shortener': function(options) {
    return new Shortener(options || {});
  }
};

},{"jsonp":6,"url":5}]},{},[23])(23)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHVueWNvZGUvcHVueWNvZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcXVlcnlzdHJpbmctZXMzL2RlY29kZS5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nLWVzMy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy91cmwvdXJsLmpzIiwibm9kZV9tb2R1bGVzL2pzb25wL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2pzb25wL25vZGVfbW9kdWxlcy9kZWJ1Zy9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL2pzb25wL25vZGVfbW9kdWxlcy9kZWJ1Zy9kZWJ1Zy5qcyIsIm5vZGVfbW9kdWxlcy9qc29ucC9ub2RlX21vZHVsZXMvZGVidWcvbm9kZV9tb2R1bGVzL21zL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2xlYWZsZXQtcm91dGluZy1tYWNoaW5lL25vZGVfbW9kdWxlcy9jb3JzbGl0ZS9jb3JzbGl0ZS5qcyIsIm5vZGVfbW9kdWxlcy9sZWFmbGV0LXJvdXRpbmctbWFjaGluZS9ub2RlX21vZHVsZXMvbGVhZmxldC9kaXN0L2xlYWZsZXQtc3JjLmpzIiwibm9kZV9tb2R1bGVzL2xlYWZsZXQtcm91dGluZy1tYWNoaW5lL25vZGVfbW9kdWxlcy9wb2x5bGluZS9zcmMvcG9seWxpbmUuanMiLCJub2RlX21vZHVsZXMvbGVhZmxldC1yb3V0aW5nLW1hY2hpbmUvc3JjL0wuUm91dGluZy5BdXRvY29tcGxldGUuanMiLCJub2RlX21vZHVsZXMvbGVhZmxldC1yb3V0aW5nLW1hY2hpbmUvc3JjL0wuUm91dGluZy5Db250cm9sLmpzIiwibm9kZV9tb2R1bGVzL2xlYWZsZXQtcm91dGluZy1tYWNoaW5lL3NyYy9MLlJvdXRpbmcuRm9ybWF0dGVyLmpzIiwibm9kZV9tb2R1bGVzL2xlYWZsZXQtcm91dGluZy1tYWNoaW5lL3NyYy9MLlJvdXRpbmcuSXRpbmVyYXJ5LmpzIiwibm9kZV9tb2R1bGVzL2xlYWZsZXQtcm91dGluZy1tYWNoaW5lL3NyYy9MLlJvdXRpbmcuSXRpbmVyYXJ5QnVpbGRlci5qcyIsIm5vZGVfbW9kdWxlcy9sZWFmbGV0LXJvdXRpbmctbWFjaGluZS9zcmMvTC5Sb3V0aW5nLkxpbmUuanMiLCJub2RlX21vZHVsZXMvbGVhZmxldC1yb3V0aW5nLW1hY2hpbmUvc3JjL0wuUm91dGluZy5Mb2NhbGl6YXRpb24uanMiLCJub2RlX21vZHVsZXMvbGVhZmxldC1yb3V0aW5nLW1hY2hpbmUvc3JjL0wuUm91dGluZy5PU1JNLmpzIiwibm9kZV9tb2R1bGVzL2xlYWZsZXQtcm91dGluZy1tYWNoaW5lL3NyYy9MLlJvdXRpbmcuUGxhbi5qcyIsIm5vZGVfbW9kdWxlcy9sZWFmbGV0LXJvdXRpbmctbWFjaGluZS9zcmMvTC5Sb3V0aW5nLldheXBvaW50LmpzIiwicHJpbnRpbmcuanMiLCJzcmMvbGVhZmxldF9vcHRpb25zLmpzIiwic3JjL2xpbmtzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ2xoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25zQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzOVJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0UkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4VEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdGJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyohIGh0dHBzOi8vbXRocy5iZS9wdW55Y29kZSB2MS4zLjIgYnkgQG1hdGhpYXMgKi9cbjsoZnVuY3Rpb24ocm9vdCkge1xuXG5cdC8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZXMgKi9cblx0dmFyIGZyZWVFeHBvcnRzID0gdHlwZW9mIGV4cG9ydHMgPT0gJ29iamVjdCcgJiYgZXhwb3J0cyAmJlxuXHRcdCFleHBvcnRzLm5vZGVUeXBlICYmIGV4cG9ydHM7XG5cdHZhciBmcmVlTW9kdWxlID0gdHlwZW9mIG1vZHVsZSA9PSAnb2JqZWN0JyAmJiBtb2R1bGUgJiZcblx0XHQhbW9kdWxlLm5vZGVUeXBlICYmIG1vZHVsZTtcblx0dmFyIGZyZWVHbG9iYWwgPSB0eXBlb2YgZ2xvYmFsID09ICdvYmplY3QnICYmIGdsb2JhbDtcblx0aWYgKFxuXHRcdGZyZWVHbG9iYWwuZ2xvYmFsID09PSBmcmVlR2xvYmFsIHx8XG5cdFx0ZnJlZUdsb2JhbC53aW5kb3cgPT09IGZyZWVHbG9iYWwgfHxcblx0XHRmcmVlR2xvYmFsLnNlbGYgPT09IGZyZWVHbG9iYWxcblx0KSB7XG5cdFx0cm9vdCA9IGZyZWVHbG9iYWw7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGBwdW55Y29kZWAgb2JqZWN0LlxuXHQgKiBAbmFtZSBwdW55Y29kZVxuXHQgKiBAdHlwZSBPYmplY3Rcblx0ICovXG5cdHZhciBwdW55Y29kZSxcblxuXHQvKiogSGlnaGVzdCBwb3NpdGl2ZSBzaWduZWQgMzItYml0IGZsb2F0IHZhbHVlICovXG5cdG1heEludCA9IDIxNDc0ODM2NDcsIC8vIGFrYS4gMHg3RkZGRkZGRiBvciAyXjMxLTFcblxuXHQvKiogQm9vdHN0cmluZyBwYXJhbWV0ZXJzICovXG5cdGJhc2UgPSAzNixcblx0dE1pbiA9IDEsXG5cdHRNYXggPSAyNixcblx0c2tldyA9IDM4LFxuXHRkYW1wID0gNzAwLFxuXHRpbml0aWFsQmlhcyA9IDcyLFxuXHRpbml0aWFsTiA9IDEyOCwgLy8gMHg4MFxuXHRkZWxpbWl0ZXIgPSAnLScsIC8vICdcXHgyRCdcblxuXHQvKiogUmVndWxhciBleHByZXNzaW9ucyAqL1xuXHRyZWdleFB1bnljb2RlID0gL154bi0tLyxcblx0cmVnZXhOb25BU0NJSSA9IC9bXlxceDIwLVxceDdFXS8sIC8vIHVucHJpbnRhYmxlIEFTQ0lJIGNoYXJzICsgbm9uLUFTQ0lJIGNoYXJzXG5cdHJlZ2V4U2VwYXJhdG9ycyA9IC9bXFx4MkVcXHUzMDAyXFx1RkYwRVxcdUZGNjFdL2csIC8vIFJGQyAzNDkwIHNlcGFyYXRvcnNcblxuXHQvKiogRXJyb3IgbWVzc2FnZXMgKi9cblx0ZXJyb3JzID0ge1xuXHRcdCdvdmVyZmxvdyc6ICdPdmVyZmxvdzogaW5wdXQgbmVlZHMgd2lkZXIgaW50ZWdlcnMgdG8gcHJvY2VzcycsXG5cdFx0J25vdC1iYXNpYyc6ICdJbGxlZ2FsIGlucHV0ID49IDB4ODAgKG5vdCBhIGJhc2ljIGNvZGUgcG9pbnQpJyxcblx0XHQnaW52YWxpZC1pbnB1dCc6ICdJbnZhbGlkIGlucHV0J1xuXHR9LFxuXG5cdC8qKiBDb252ZW5pZW5jZSBzaG9ydGN1dHMgKi9cblx0YmFzZU1pbnVzVE1pbiA9IGJhc2UgLSB0TWluLFxuXHRmbG9vciA9IE1hdGguZmxvb3IsXG5cdHN0cmluZ0Zyb21DaGFyQ29kZSA9IFN0cmluZy5mcm9tQ2hhckNvZGUsXG5cblx0LyoqIFRlbXBvcmFyeSB2YXJpYWJsZSAqL1xuXHRrZXk7XG5cblx0LyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblx0LyoqXG5cdCAqIEEgZ2VuZXJpYyBlcnJvciB1dGlsaXR5IGZ1bmN0aW9uLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gdHlwZSBUaGUgZXJyb3IgdHlwZS5cblx0ICogQHJldHVybnMge0Vycm9yfSBUaHJvd3MgYSBgUmFuZ2VFcnJvcmAgd2l0aCB0aGUgYXBwbGljYWJsZSBlcnJvciBtZXNzYWdlLlxuXHQgKi9cblx0ZnVuY3Rpb24gZXJyb3IodHlwZSkge1xuXHRcdHRocm93IFJhbmdlRXJyb3IoZXJyb3JzW3R5cGVdKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIGdlbmVyaWMgYEFycmF5I21hcGAgdXRpbGl0eSBmdW5jdGlvbi5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIGl0ZXJhdGUgb3Zlci5cblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRoYXQgZ2V0cyBjYWxsZWQgZm9yIGV2ZXJ5IGFycmF5XG5cdCAqIGl0ZW0uXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gQSBuZXcgYXJyYXkgb2YgdmFsdWVzIHJldHVybmVkIGJ5IHRoZSBjYWxsYmFjayBmdW5jdGlvbi5cblx0ICovXG5cdGZ1bmN0aW9uIG1hcChhcnJheSwgZm4pIHtcblx0XHR2YXIgbGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xuXHRcdHZhciByZXN1bHQgPSBbXTtcblx0XHR3aGlsZSAobGVuZ3RoLS0pIHtcblx0XHRcdHJlc3VsdFtsZW5ndGhdID0gZm4oYXJyYXlbbGVuZ3RoXSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogQSBzaW1wbGUgYEFycmF5I21hcGAtbGlrZSB3cmFwcGVyIHRvIHdvcmsgd2l0aCBkb21haW4gbmFtZSBzdHJpbmdzIG9yIGVtYWlsXG5cdCAqIGFkZHJlc3Nlcy5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUgb3IgZW1haWwgYWRkcmVzcy5cblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRoYXQgZ2V0cyBjYWxsZWQgZm9yIGV2ZXJ5XG5cdCAqIGNoYXJhY3Rlci5cblx0ICogQHJldHVybnMge0FycmF5fSBBIG5ldyBzdHJpbmcgb2YgY2hhcmFjdGVycyByZXR1cm5lZCBieSB0aGUgY2FsbGJhY2tcblx0ICogZnVuY3Rpb24uXG5cdCAqL1xuXHRmdW5jdGlvbiBtYXBEb21haW4oc3RyaW5nLCBmbikge1xuXHRcdHZhciBwYXJ0cyA9IHN0cmluZy5zcGxpdCgnQCcpO1xuXHRcdHZhciByZXN1bHQgPSAnJztcblx0XHRpZiAocGFydHMubGVuZ3RoID4gMSkge1xuXHRcdFx0Ly8gSW4gZW1haWwgYWRkcmVzc2VzLCBvbmx5IHRoZSBkb21haW4gbmFtZSBzaG91bGQgYmUgcHVueWNvZGVkLiBMZWF2ZVxuXHRcdFx0Ly8gdGhlIGxvY2FsIHBhcnQgKGkuZS4gZXZlcnl0aGluZyB1cCB0byBgQGApIGludGFjdC5cblx0XHRcdHJlc3VsdCA9IHBhcnRzWzBdICsgJ0AnO1xuXHRcdFx0c3RyaW5nID0gcGFydHNbMV07XG5cdFx0fVxuXHRcdC8vIEF2b2lkIGBzcGxpdChyZWdleClgIGZvciBJRTggY29tcGF0aWJpbGl0eS4gU2VlICMxNy5cblx0XHRzdHJpbmcgPSBzdHJpbmcucmVwbGFjZShyZWdleFNlcGFyYXRvcnMsICdcXHgyRScpO1xuXHRcdHZhciBsYWJlbHMgPSBzdHJpbmcuc3BsaXQoJy4nKTtcblx0XHR2YXIgZW5jb2RlZCA9IG1hcChsYWJlbHMsIGZuKS5qb2luKCcuJyk7XG5cdFx0cmV0dXJuIHJlc3VsdCArIGVuY29kZWQ7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhbiBhcnJheSBjb250YWluaW5nIHRoZSBudW1lcmljIGNvZGUgcG9pbnRzIG9mIGVhY2ggVW5pY29kZVxuXHQgKiBjaGFyYWN0ZXIgaW4gdGhlIHN0cmluZy4gV2hpbGUgSmF2YVNjcmlwdCB1c2VzIFVDUy0yIGludGVybmFsbHksXG5cdCAqIHRoaXMgZnVuY3Rpb24gd2lsbCBjb252ZXJ0IGEgcGFpciBvZiBzdXJyb2dhdGUgaGFsdmVzIChlYWNoIG9mIHdoaWNoXG5cdCAqIFVDUy0yIGV4cG9zZXMgYXMgc2VwYXJhdGUgY2hhcmFjdGVycykgaW50byBhIHNpbmdsZSBjb2RlIHBvaW50LFxuXHQgKiBtYXRjaGluZyBVVEYtMTYuXG5cdCAqIEBzZWUgYHB1bnljb2RlLnVjczIuZW5jb2RlYFxuXHQgKiBAc2VlIDxodHRwczovL21hdGhpYXNieW5lbnMuYmUvbm90ZXMvamF2YXNjcmlwdC1lbmNvZGluZz5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlLnVjczJcblx0ICogQG5hbWUgZGVjb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBzdHJpbmcgVGhlIFVuaWNvZGUgaW5wdXQgc3RyaW5nIChVQ1MtMikuXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gVGhlIG5ldyBhcnJheSBvZiBjb2RlIHBvaW50cy5cblx0ICovXG5cdGZ1bmN0aW9uIHVjczJkZWNvZGUoc3RyaW5nKSB7XG5cdFx0dmFyIG91dHB1dCA9IFtdLFxuXHRcdCAgICBjb3VudGVyID0gMCxcblx0XHQgICAgbGVuZ3RoID0gc3RyaW5nLmxlbmd0aCxcblx0XHQgICAgdmFsdWUsXG5cdFx0ICAgIGV4dHJhO1xuXHRcdHdoaWxlIChjb3VudGVyIDwgbGVuZ3RoKSB7XG5cdFx0XHR2YWx1ZSA9IHN0cmluZy5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cdFx0XHRpZiAodmFsdWUgPj0gMHhEODAwICYmIHZhbHVlIDw9IDB4REJGRiAmJiBjb3VudGVyIDwgbGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGhpZ2ggc3Vycm9nYXRlLCBhbmQgdGhlcmUgaXMgYSBuZXh0IGNoYXJhY3RlclxuXHRcdFx0XHRleHRyYSA9IHN0cmluZy5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cdFx0XHRcdGlmICgoZXh0cmEgJiAweEZDMDApID09IDB4REMwMCkgeyAvLyBsb3cgc3Vycm9nYXRlXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goKCh2YWx1ZSAmIDB4M0ZGKSA8PCAxMCkgKyAoZXh0cmEgJiAweDNGRikgKyAweDEwMDAwKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyB1bm1hdGNoZWQgc3Vycm9nYXRlOyBvbmx5IGFwcGVuZCB0aGlzIGNvZGUgdW5pdCwgaW4gY2FzZSB0aGUgbmV4dFxuXHRcdFx0XHRcdC8vIGNvZGUgdW5pdCBpcyB0aGUgaGlnaCBzdXJyb2dhdGUgb2YgYSBzdXJyb2dhdGUgcGFpclxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHZhbHVlKTtcblx0XHRcdFx0XHRjb3VudGVyLS07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgc3RyaW5nIGJhc2VkIG9uIGFuIGFycmF5IG9mIG51bWVyaWMgY29kZSBwb2ludHMuXG5cdCAqIEBzZWUgYHB1bnljb2RlLnVjczIuZGVjb2RlYFxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGUudWNzMlxuXHQgKiBAbmFtZSBlbmNvZGVcblx0ICogQHBhcmFtIHtBcnJheX0gY29kZVBvaW50cyBUaGUgYXJyYXkgb2YgbnVtZXJpYyBjb2RlIHBvaW50cy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIG5ldyBVbmljb2RlIHN0cmluZyAoVUNTLTIpLlxuXHQgKi9cblx0ZnVuY3Rpb24gdWNzMmVuY29kZShhcnJheSkge1xuXHRcdHJldHVybiBtYXAoYXJyYXksIGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHR2YXIgb3V0cHV0ID0gJyc7XG5cdFx0XHRpZiAodmFsdWUgPiAweEZGRkYpIHtcblx0XHRcdFx0dmFsdWUgLT0gMHgxMDAwMDtcblx0XHRcdFx0b3V0cHV0ICs9IHN0cmluZ0Zyb21DaGFyQ29kZSh2YWx1ZSA+Pj4gMTAgJiAweDNGRiB8IDB4RDgwMCk7XG5cdFx0XHRcdHZhbHVlID0gMHhEQzAwIHwgdmFsdWUgJiAweDNGRjtcblx0XHRcdH1cblx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUpO1xuXHRcdFx0cmV0dXJuIG91dHB1dDtcblx0XHR9KS5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGJhc2ljIGNvZGUgcG9pbnQgaW50byBhIGRpZ2l0L2ludGVnZXIuXG5cdCAqIEBzZWUgYGRpZ2l0VG9CYXNpYygpYFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0gY29kZVBvaW50IFRoZSBiYXNpYyBudW1lcmljIGNvZGUgcG9pbnQgdmFsdWUuXG5cdCAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBudW1lcmljIHZhbHVlIG9mIGEgYmFzaWMgY29kZSBwb2ludCAoZm9yIHVzZSBpblxuXHQgKiByZXByZXNlbnRpbmcgaW50ZWdlcnMpIGluIHRoZSByYW5nZSBgMGAgdG8gYGJhc2UgLSAxYCwgb3IgYGJhc2VgIGlmXG5cdCAqIHRoZSBjb2RlIHBvaW50IGRvZXMgbm90IHJlcHJlc2VudCBhIHZhbHVlLlxuXHQgKi9cblx0ZnVuY3Rpb24gYmFzaWNUb0RpZ2l0KGNvZGVQb2ludCkge1xuXHRcdGlmIChjb2RlUG9pbnQgLSA0OCA8IDEwKSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gMjI7XG5cdFx0fVxuXHRcdGlmIChjb2RlUG9pbnQgLSA2NSA8IDI2KSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gNjU7XG5cdFx0fVxuXHRcdGlmIChjb2RlUG9pbnQgLSA5NyA8IDI2KSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gOTc7XG5cdFx0fVxuXHRcdHJldHVybiBiYXNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgZGlnaXQvaW50ZWdlciBpbnRvIGEgYmFzaWMgY29kZSBwb2ludC5cblx0ICogQHNlZSBgYmFzaWNUb0RpZ2l0KClgXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBkaWdpdCBUaGUgbnVtZXJpYyB2YWx1ZSBvZiBhIGJhc2ljIGNvZGUgcG9pbnQuXG5cdCAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBiYXNpYyBjb2RlIHBvaW50IHdob3NlIHZhbHVlICh3aGVuIHVzZWQgZm9yXG5cdCAqIHJlcHJlc2VudGluZyBpbnRlZ2VycykgaXMgYGRpZ2l0YCwgd2hpY2ggbmVlZHMgdG8gYmUgaW4gdGhlIHJhbmdlXG5cdCAqIGAwYCB0byBgYmFzZSAtIDFgLiBJZiBgZmxhZ2AgaXMgbm9uLXplcm8sIHRoZSB1cHBlcmNhc2UgZm9ybSBpc1xuXHQgKiB1c2VkOyBlbHNlLCB0aGUgbG93ZXJjYXNlIGZvcm0gaXMgdXNlZC4gVGhlIGJlaGF2aW9yIGlzIHVuZGVmaW5lZFxuXHQgKiBpZiBgZmxhZ2AgaXMgbm9uLXplcm8gYW5kIGBkaWdpdGAgaGFzIG5vIHVwcGVyY2FzZSBmb3JtLlxuXHQgKi9cblx0ZnVuY3Rpb24gZGlnaXRUb0Jhc2ljKGRpZ2l0LCBmbGFnKSB7XG5cdFx0Ly8gIDAuLjI1IG1hcCB0byBBU0NJSSBhLi56IG9yIEEuLlpcblx0XHQvLyAyNi4uMzUgbWFwIHRvIEFTQ0lJIDAuLjlcblx0XHRyZXR1cm4gZGlnaXQgKyAyMiArIDc1ICogKGRpZ2l0IDwgMjYpIC0gKChmbGFnICE9IDApIDw8IDUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJpYXMgYWRhcHRhdGlvbiBmdW5jdGlvbiBhcyBwZXIgc2VjdGlvbiAzLjQgb2YgUkZDIDM0OTIuXG5cdCAqIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM0OTIjc2VjdGlvbi0zLjRcblx0ICogQHByaXZhdGVcblx0ICovXG5cdGZ1bmN0aW9uIGFkYXB0KGRlbHRhLCBudW1Qb2ludHMsIGZpcnN0VGltZSkge1xuXHRcdHZhciBrID0gMDtcblx0XHRkZWx0YSA9IGZpcnN0VGltZSA/IGZsb29yKGRlbHRhIC8gZGFtcCkgOiBkZWx0YSA+PiAxO1xuXHRcdGRlbHRhICs9IGZsb29yKGRlbHRhIC8gbnVtUG9pbnRzKTtcblx0XHRmb3IgKC8qIG5vIGluaXRpYWxpemF0aW9uICovOyBkZWx0YSA+IGJhc2VNaW51c1RNaW4gKiB0TWF4ID4+IDE7IGsgKz0gYmFzZSkge1xuXHRcdFx0ZGVsdGEgPSBmbG9vcihkZWx0YSAvIGJhc2VNaW51c1RNaW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gZmxvb3IoayArIChiYXNlTWludXNUTWluICsgMSkgKiBkZWx0YSAvIChkZWx0YSArIHNrZXcpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMgdG8gYSBzdHJpbmcgb2YgVW5pY29kZVxuXHQgKiBzeW1ib2xzLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IFRoZSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgcmVzdWx0aW5nIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMuXG5cdCAqL1xuXHRmdW5jdGlvbiBkZWNvZGUoaW5wdXQpIHtcblx0XHQvLyBEb24ndCB1c2UgVUNTLTJcblx0XHR2YXIgb3V0cHV0ID0gW10sXG5cdFx0ICAgIGlucHV0TGVuZ3RoID0gaW5wdXQubGVuZ3RoLFxuXHRcdCAgICBvdXQsXG5cdFx0ICAgIGkgPSAwLFxuXHRcdCAgICBuID0gaW5pdGlhbE4sXG5cdFx0ICAgIGJpYXMgPSBpbml0aWFsQmlhcyxcblx0XHQgICAgYmFzaWMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIGluZGV4LFxuXHRcdCAgICBvbGRpLFxuXHRcdCAgICB3LFxuXHRcdCAgICBrLFxuXHRcdCAgICBkaWdpdCxcblx0XHQgICAgdCxcblx0XHQgICAgLyoqIENhY2hlZCBjYWxjdWxhdGlvbiByZXN1bHRzICovXG5cdFx0ICAgIGJhc2VNaW51c1Q7XG5cblx0XHQvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzOiBsZXQgYGJhc2ljYCBiZSB0aGUgbnVtYmVyIG9mIGlucHV0IGNvZGVcblx0XHQvLyBwb2ludHMgYmVmb3JlIHRoZSBsYXN0IGRlbGltaXRlciwgb3IgYDBgIGlmIHRoZXJlIGlzIG5vbmUsIHRoZW4gY29weVxuXHRcdC8vIHRoZSBmaXJzdCBiYXNpYyBjb2RlIHBvaW50cyB0byB0aGUgb3V0cHV0LlxuXG5cdFx0YmFzaWMgPSBpbnB1dC5sYXN0SW5kZXhPZihkZWxpbWl0ZXIpO1xuXHRcdGlmIChiYXNpYyA8IDApIHtcblx0XHRcdGJhc2ljID0gMDtcblx0XHR9XG5cblx0XHRmb3IgKGogPSAwOyBqIDwgYmFzaWM7ICsraikge1xuXHRcdFx0Ly8gaWYgaXQncyBub3QgYSBiYXNpYyBjb2RlIHBvaW50XG5cdFx0XHRpZiAoaW5wdXQuY2hhckNvZGVBdChqKSA+PSAweDgwKSB7XG5cdFx0XHRcdGVycm9yKCdub3QtYmFzaWMnKTtcblx0XHRcdH1cblx0XHRcdG91dHB1dC5wdXNoKGlucHV0LmNoYXJDb2RlQXQoaikpO1xuXHRcdH1cblxuXHRcdC8vIE1haW4gZGVjb2RpbmcgbG9vcDogc3RhcnQganVzdCBhZnRlciB0aGUgbGFzdCBkZWxpbWl0ZXIgaWYgYW55IGJhc2ljIGNvZGVcblx0XHQvLyBwb2ludHMgd2VyZSBjb3BpZWQ7IHN0YXJ0IGF0IHRoZSBiZWdpbm5pbmcgb3RoZXJ3aXNlLlxuXG5cdFx0Zm9yIChpbmRleCA9IGJhc2ljID4gMCA/IGJhc2ljICsgMSA6IDA7IGluZGV4IDwgaW5wdXRMZW5ndGg7IC8qIG5vIGZpbmFsIGV4cHJlc3Npb24gKi8pIHtcblxuXHRcdFx0Ly8gYGluZGV4YCBpcyB0aGUgaW5kZXggb2YgdGhlIG5leHQgY2hhcmFjdGVyIHRvIGJlIGNvbnN1bWVkLlxuXHRcdFx0Ly8gRGVjb2RlIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXIgaW50byBgZGVsdGFgLFxuXHRcdFx0Ly8gd2hpY2ggZ2V0cyBhZGRlZCB0byBgaWAuIFRoZSBvdmVyZmxvdyBjaGVja2luZyBpcyBlYXNpZXJcblx0XHRcdC8vIGlmIHdlIGluY3JlYXNlIGBpYCBhcyB3ZSBnbywgdGhlbiBzdWJ0cmFjdCBvZmYgaXRzIHN0YXJ0aW5nXG5cdFx0XHQvLyB2YWx1ZSBhdCB0aGUgZW5kIHRvIG9idGFpbiBgZGVsdGFgLlxuXHRcdFx0Zm9yIChvbGRpID0gaSwgdyA9IDEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXG5cdFx0XHRcdGlmIChpbmRleCA+PSBpbnB1dExlbmd0aCkge1xuXHRcdFx0XHRcdGVycm9yKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaWdpdCA9IGJhc2ljVG9EaWdpdChpbnB1dC5jaGFyQ29kZUF0KGluZGV4KyspKTtcblxuXHRcdFx0XHRpZiAoZGlnaXQgPj0gYmFzZSB8fCBkaWdpdCA+IGZsb29yKChtYXhJbnQgLSBpKSAvIHcpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpICs9IGRpZ2l0ICogdztcblx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cblx0XHRcdFx0aWYgKGRpZ2l0IDwgdCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YmFzZU1pbnVzVCA9IGJhc2UgLSB0O1xuXHRcdFx0XHRpZiAodyA+IGZsb29yKG1heEludCAvIGJhc2VNaW51c1QpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR3ICo9IGJhc2VNaW51c1Q7XG5cblx0XHRcdH1cblxuXHRcdFx0b3V0ID0gb3V0cHV0Lmxlbmd0aCArIDE7XG5cdFx0XHRiaWFzID0gYWRhcHQoaSAtIG9sZGksIG91dCwgb2xkaSA9PSAwKTtcblxuXHRcdFx0Ly8gYGlgIHdhcyBzdXBwb3NlZCB0byB3cmFwIGFyb3VuZCBmcm9tIGBvdXRgIHRvIGAwYCxcblx0XHRcdC8vIGluY3JlbWVudGluZyBgbmAgZWFjaCB0aW1lLCBzbyB3ZSdsbCBmaXggdGhhdCBub3c6XG5cdFx0XHRpZiAoZmxvb3IoaSAvIG91dCkgPiBtYXhJbnQgLSBuKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRuICs9IGZsb29yKGkgLyBvdXQpO1xuXHRcdFx0aSAlPSBvdXQ7XG5cblx0XHRcdC8vIEluc2VydCBgbmAgYXQgcG9zaXRpb24gYGlgIG9mIHRoZSBvdXRwdXRcblx0XHRcdG91dHB1dC5zcGxpY2UoaSsrLCAwLCBuKTtcblxuXHRcdH1cblxuXHRcdHJldHVybiB1Y3MyZW5jb2RlKG91dHB1dCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzIChlLmcuIGEgZG9tYWluIG5hbWUgbGFiZWwpIHRvIGFcblx0ICogUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZW5jb2RlKGlucHV0KSB7XG5cdFx0dmFyIG4sXG5cdFx0ICAgIGRlbHRhLFxuXHRcdCAgICBoYW5kbGVkQ1BDb3VudCxcblx0XHQgICAgYmFzaWNMZW5ndGgsXG5cdFx0ICAgIGJpYXMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIG0sXG5cdFx0ICAgIHEsXG5cdFx0ICAgIGssXG5cdFx0ICAgIHQsXG5cdFx0ICAgIGN1cnJlbnRWYWx1ZSxcblx0XHQgICAgb3V0cHV0ID0gW10sXG5cdFx0ICAgIC8qKiBgaW5wdXRMZW5ndGhgIHdpbGwgaG9sZCB0aGUgbnVtYmVyIG9mIGNvZGUgcG9pbnRzIGluIGBpbnB1dGAuICovXG5cdFx0ICAgIGlucHV0TGVuZ3RoLFxuXHRcdCAgICAvKiogQ2FjaGVkIGNhbGN1bGF0aW9uIHJlc3VsdHMgKi9cblx0XHQgICAgaGFuZGxlZENQQ291bnRQbHVzT25lLFxuXHRcdCAgICBiYXNlTWludXNULFxuXHRcdCAgICBxTWludXNUO1xuXG5cdFx0Ly8gQ29udmVydCB0aGUgaW5wdXQgaW4gVUNTLTIgdG8gVW5pY29kZVxuXHRcdGlucHV0ID0gdWNzMmRlY29kZShpbnB1dCk7XG5cblx0XHQvLyBDYWNoZSB0aGUgbGVuZ3RoXG5cdFx0aW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGg7XG5cblx0XHQvLyBJbml0aWFsaXplIHRoZSBzdGF0ZVxuXHRcdG4gPSBpbml0aWFsTjtcblx0XHRkZWx0YSA9IDA7XG5cdFx0YmlhcyA9IGluaXRpYWxCaWFzO1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBiYXNpYyBjb2RlIHBvaW50c1xuXHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCAweDgwKSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHN0cmluZ0Zyb21DaGFyQ29kZShjdXJyZW50VmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRoYW5kbGVkQ1BDb3VudCA9IGJhc2ljTGVuZ3RoID0gb3V0cHV0Lmxlbmd0aDtcblxuXHRcdC8vIGBoYW5kbGVkQ1BDb3VudGAgaXMgdGhlIG51bWJlciBvZiBjb2RlIHBvaW50cyB0aGF0IGhhdmUgYmVlbiBoYW5kbGVkO1xuXHRcdC8vIGBiYXNpY0xlbmd0aGAgaXMgdGhlIG51bWJlciBvZiBiYXNpYyBjb2RlIHBvaW50cy5cblxuXHRcdC8vIEZpbmlzaCB0aGUgYmFzaWMgc3RyaW5nIC0gaWYgaXQgaXMgbm90IGVtcHR5IC0gd2l0aCBhIGRlbGltaXRlclxuXHRcdGlmIChiYXNpY0xlbmd0aCkge1xuXHRcdFx0b3V0cHV0LnB1c2goZGVsaW1pdGVyKTtcblx0XHR9XG5cblx0XHQvLyBNYWluIGVuY29kaW5nIGxvb3A6XG5cdFx0d2hpbGUgKGhhbmRsZWRDUENvdW50IDwgaW5wdXRMZW5ndGgpIHtcblxuXHRcdFx0Ly8gQWxsIG5vbi1iYXNpYyBjb2RlIHBvaW50cyA8IG4gaGF2ZSBiZWVuIGhhbmRsZWQgYWxyZWFkeS4gRmluZCB0aGUgbmV4dFxuXHRcdFx0Ly8gbGFyZ2VyIG9uZTpcblx0XHRcdGZvciAobSA9IG1heEludCwgaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlID49IG4gJiYgY3VycmVudFZhbHVlIDwgbSkge1xuXHRcdFx0XHRcdG0gPSBjdXJyZW50VmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5jcmVhc2UgYGRlbHRhYCBlbm91Z2ggdG8gYWR2YW5jZSB0aGUgZGVjb2RlcidzIDxuLGk+IHN0YXRlIHRvIDxtLDA+LFxuXHRcdFx0Ly8gYnV0IGd1YXJkIGFnYWluc3Qgb3ZlcmZsb3dcblx0XHRcdGhhbmRsZWRDUENvdW50UGx1c09uZSA9IGhhbmRsZWRDUENvdW50ICsgMTtcblx0XHRcdGlmIChtIC0gbiA+IGZsb29yKChtYXhJbnQgLSBkZWx0YSkgLyBoYW5kbGVkQ1BDb3VudFBsdXNPbmUpKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWx0YSArPSAobSAtIG4pICogaGFuZGxlZENQQ291bnRQbHVzT25lO1xuXHRcdFx0biA9IG07XG5cblx0XHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCBuICYmICsrZGVsdGEgPiBtYXhJbnQpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPT0gbikge1xuXHRcdFx0XHRcdC8vIFJlcHJlc2VudCBkZWx0YSBhcyBhIGdlbmVyYWxpemVkIHZhcmlhYmxlLWxlbmd0aCBpbnRlZ2VyXG5cdFx0XHRcdFx0Zm9yIChxID0gZGVsdGEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXHRcdFx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cdFx0XHRcdFx0XHRpZiAocSA8IHQpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRxTWludXNUID0gcSAtIHQ7XG5cdFx0XHRcdFx0XHRiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cdFx0XHRcdFx0XHRvdXRwdXQucHVzaChcblx0XHRcdFx0XHRcdFx0c3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyh0ICsgcU1pbnVzVCAlIGJhc2VNaW51c1QsIDApKVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHEgPSBmbG9vcihxTWludXNUIC8gYmFzZU1pbnVzVCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goc3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyhxLCAwKSkpO1xuXHRcdFx0XHRcdGJpYXMgPSBhZGFwdChkZWx0YSwgaGFuZGxlZENQQ291bnRQbHVzT25lLCBoYW5kbGVkQ1BDb3VudCA9PSBiYXNpY0xlbmd0aCk7XG5cdFx0XHRcdFx0ZGVsdGEgPSAwO1xuXHRcdFx0XHRcdCsraGFuZGxlZENQQ291bnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0KytkZWx0YTtcblx0XHRcdCsrbjtcblxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0LmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIG9yIGFuIGVtYWlsIGFkZHJlc3Ncblx0ICogdG8gVW5pY29kZS4gT25seSB0aGUgUHVueWNvZGVkIHBhcnRzIG9mIHRoZSBpbnB1dCB3aWxsIGJlIGNvbnZlcnRlZCwgaS5lLlxuXHQgKiBpdCBkb2Vzbid0IG1hdHRlciBpZiB5b3UgY2FsbCBpdCBvbiBhIHN0cmluZyB0aGF0IGhhcyBhbHJlYWR5IGJlZW5cblx0ICogY29udmVydGVkIHRvIFVuaWNvZGUuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gaW5wdXQgVGhlIFB1bnljb2RlZCBkb21haW4gbmFtZSBvciBlbWFpbCBhZGRyZXNzIHRvXG5cdCAqIGNvbnZlcnQgdG8gVW5pY29kZS5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIFVuaWNvZGUgcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIFB1bnljb2RlXG5cdCAqIHN0cmluZy5cblx0ICovXG5cdGZ1bmN0aW9uIHRvVW5pY29kZShpbnB1dCkge1xuXHRcdHJldHVybiBtYXBEb21haW4oaW5wdXQsIGZ1bmN0aW9uKHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlZ2V4UHVueWNvZGUudGVzdChzdHJpbmcpXG5cdFx0XHRcdD8gZGVjb2RlKHN0cmluZy5zbGljZSg0KS50b0xvd2VyQ2FzZSgpKVxuXHRcdFx0XHQ6IHN0cmluZztcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFVuaWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIG9yIGFuIGVtYWlsIGFkZHJlc3MgdG9cblx0ICogUHVueWNvZGUuIE9ubHkgdGhlIG5vbi1BU0NJSSBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgd2lsbCBiZSBjb252ZXJ0ZWQsXG5cdCAqIGkuZS4gaXQgZG9lc24ndCBtYXR0ZXIgaWYgeW91IGNhbGwgaXQgd2l0aCBhIGRvbWFpbiB0aGF0J3MgYWxyZWFkeSBpblxuXHQgKiBBU0NJSS5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgZG9tYWluIG5hbWUgb3IgZW1haWwgYWRkcmVzcyB0byBjb252ZXJ0LCBhcyBhXG5cdCAqIFVuaWNvZGUgc3RyaW5nLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgUHVueWNvZGUgcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIGRvbWFpbiBuYW1lIG9yXG5cdCAqIGVtYWlsIGFkZHJlc3MuXG5cdCAqL1xuXHRmdW5jdGlvbiB0b0FTQ0lJKGlucHV0KSB7XG5cdFx0cmV0dXJuIG1hcERvbWFpbihpbnB1dCwgZnVuY3Rpb24oc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gcmVnZXhOb25BU0NJSS50ZXN0KHN0cmluZylcblx0XHRcdFx0PyAneG4tLScgKyBlbmNvZGUoc3RyaW5nKVxuXHRcdFx0XHQ6IHN0cmluZztcblx0XHR9KTtcblx0fVxuXG5cdC8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cdC8qKiBEZWZpbmUgdGhlIHB1YmxpYyBBUEkgKi9cblx0cHVueWNvZGUgPSB7XG5cdFx0LyoqXG5cdFx0ICogQSBzdHJpbmcgcmVwcmVzZW50aW5nIHRoZSBjdXJyZW50IFB1bnljb2RlLmpzIHZlcnNpb24gbnVtYmVyLlxuXHRcdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHRcdCAqIEB0eXBlIFN0cmluZ1xuXHRcdCAqL1xuXHRcdCd2ZXJzaW9uJzogJzEuMy4yJyxcblx0XHQvKipcblx0XHQgKiBBbiBvYmplY3Qgb2YgbWV0aG9kcyB0byBjb252ZXJ0IGZyb20gSmF2YVNjcmlwdCdzIGludGVybmFsIGNoYXJhY3RlclxuXHRcdCAqIHJlcHJlc2VudGF0aW9uIChVQ1MtMikgdG8gVW5pY29kZSBjb2RlIHBvaW50cywgYW5kIGJhY2suXG5cdFx0ICogQHNlZSA8aHR0cHM6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdFx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdFx0ICogQHR5cGUgT2JqZWN0XG5cdFx0ICovXG5cdFx0J3VjczInOiB7XG5cdFx0XHQnZGVjb2RlJzogdWNzMmRlY29kZSxcblx0XHRcdCdlbmNvZGUnOiB1Y3MyZW5jb2RlXG5cdFx0fSxcblx0XHQnZGVjb2RlJzogZGVjb2RlLFxuXHRcdCdlbmNvZGUnOiBlbmNvZGUsXG5cdFx0J3RvQVNDSUknOiB0b0FTQ0lJLFxuXHRcdCd0b1VuaWNvZGUnOiB0b1VuaWNvZGVcblx0fTtcblxuXHQvKiogRXhwb3NlIGBwdW55Y29kZWAgKi9cblx0Ly8gU29tZSBBTUQgYnVpbGQgb3B0aW1pemVycywgbGlrZSByLmpzLCBjaGVjayBmb3Igc3BlY2lmaWMgY29uZGl0aW9uIHBhdHRlcm5zXG5cdC8vIGxpa2UgdGhlIGZvbGxvd2luZzpcblx0aWYgKFxuXHRcdHR5cGVvZiBkZWZpbmUgPT0gJ2Z1bmN0aW9uJyAmJlxuXHRcdHR5cGVvZiBkZWZpbmUuYW1kID09ICdvYmplY3QnICYmXG5cdFx0ZGVmaW5lLmFtZFxuXHQpIHtcblx0XHRkZWZpbmUoJ3B1bnljb2RlJywgZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gcHVueWNvZGU7XG5cdFx0fSk7XG5cdH0gZWxzZSBpZiAoZnJlZUV4cG9ydHMgJiYgZnJlZU1vZHVsZSkge1xuXHRcdGlmIChtb2R1bGUuZXhwb3J0cyA9PSBmcmVlRXhwb3J0cykgeyAvLyBpbiBOb2RlLmpzIG9yIFJpbmdvSlMgdjAuOC4wK1xuXHRcdFx0ZnJlZU1vZHVsZS5leHBvcnRzID0gcHVueWNvZGU7XG5cdFx0fSBlbHNlIHsgLy8gaW4gTmFyd2hhbCBvciBSaW5nb0pTIHYwLjcuMC1cblx0XHRcdGZvciAoa2V5IGluIHB1bnljb2RlKSB7XG5cdFx0XHRcdHB1bnljb2RlLmhhc093blByb3BlcnR5KGtleSkgJiYgKGZyZWVFeHBvcnRzW2tleV0gPSBwdW55Y29kZVtrZXldKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7IC8vIGluIFJoaW5vIG9yIGEgd2ViIGJyb3dzZXJcblx0XHRyb290LnB1bnljb2RlID0gcHVueWNvZGU7XG5cdH1cblxufSh0aGlzKSk7XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG4vLyBJZiBvYmouaGFzT3duUHJvcGVydHkgaGFzIGJlZW4gb3ZlcnJpZGRlbiwgdGhlbiBjYWxsaW5nXG4vLyBvYmouaGFzT3duUHJvcGVydHkocHJvcCkgd2lsbCBicmVhay5cbi8vIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL2pveWVudC9ub2RlL2lzc3Vlcy8xNzA3XG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHFzLCBzZXAsIGVxLCBvcHRpb25zKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICB2YXIgb2JqID0ge307XG5cbiAgaWYgKHR5cGVvZiBxcyAhPT0gJ3N0cmluZycgfHwgcXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIHZhciByZWdleHAgPSAvXFwrL2c7XG4gIHFzID0gcXMuc3BsaXQoc2VwKTtcblxuICB2YXIgbWF4S2V5cyA9IDEwMDA7XG4gIGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLm1heEtleXMgPT09ICdudW1iZXInKSB7XG4gICAgbWF4S2V5cyA9IG9wdGlvbnMubWF4S2V5cztcbiAgfVxuXG4gIHZhciBsZW4gPSBxcy5sZW5ndGg7XG4gIC8vIG1heEtleXMgPD0gMCBtZWFucyB0aGF0IHdlIHNob3VsZCBub3QgbGltaXQga2V5cyBjb3VudFxuICBpZiAobWF4S2V5cyA+IDAgJiYgbGVuID4gbWF4S2V5cykge1xuICAgIGxlbiA9IG1heEtleXM7XG4gIH1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKSB7XG4gICAgdmFyIHggPSBxc1tpXS5yZXBsYWNlKHJlZ2V4cCwgJyUyMCcpLFxuICAgICAgICBpZHggPSB4LmluZGV4T2YoZXEpLFxuICAgICAgICBrc3RyLCB2c3RyLCBrLCB2O1xuXG4gICAgaWYgKGlkeCA+PSAwKSB7XG4gICAgICBrc3RyID0geC5zdWJzdHIoMCwgaWR4KTtcbiAgICAgIHZzdHIgPSB4LnN1YnN0cihpZHggKyAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAga3N0ciA9IHg7XG4gICAgICB2c3RyID0gJyc7XG4gICAgfVxuXG4gICAgayA9IGRlY29kZVVSSUNvbXBvbmVudChrc3RyKTtcbiAgICB2ID0gZGVjb2RlVVJJQ29tcG9uZW50KHZzdHIpO1xuXG4gICAgaWYgKCFoYXNPd25Qcm9wZXJ0eShvYmosIGspKSB7XG4gICAgICBvYmpba10gPSB2O1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICBvYmpba10ucHVzaCh2KTtcbiAgICB9IGVsc2Uge1xuICAgICAgb2JqW2tdID0gW29ialtrXSwgdl07XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9iajtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIHN0cmluZ2lmeVByaW1pdGl2ZSA9IGZ1bmN0aW9uKHYpIHtcbiAgc3dpdGNoICh0eXBlb2Ygdikge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gdjtcblxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIHYgPyAndHJ1ZScgOiAnZmFsc2UnO1xuXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBpc0Zpbml0ZSh2KSA/IHYgOiAnJztcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob2JqLCBzZXAsIGVxLCBuYW1lKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICBpZiAob2JqID09PSBudWxsKSB7XG4gICAgb2JqID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIG1hcChvYmplY3RLZXlzKG9iaiksIGZ1bmN0aW9uKGspIHtcbiAgICAgIHZhciBrcyA9IGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUoaykpICsgZXE7XG4gICAgICBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICAgIHJldHVybiBtYXAob2JqW2tdLCBmdW5jdGlvbih2KSB7XG4gICAgICAgICAgcmV0dXJuIGtzICsgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZSh2KSk7XG4gICAgICAgIH0pLmpvaW4oc2VwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBrcyArIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUob2JqW2tdKSk7XG4gICAgICB9XG4gICAgfSkuam9pbihzZXApO1xuXG4gIH1cblxuICBpZiAoIW5hbWUpIHJldHVybiAnJztcbiAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUobmFtZSkpICsgZXEgK1xuICAgICAgICAgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShvYmopKTtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuXG5mdW5jdGlvbiBtYXAgKHhzLCBmKSB7XG4gIGlmICh4cy5tYXApIHJldHVybiB4cy5tYXAoZik7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB4cy5sZW5ndGg7IGkrKykge1xuICAgIHJlcy5wdXNoKGYoeHNbaV0sIGkpKTtcbiAgfVxuICByZXR1cm4gcmVzO1xufVxuXG52YXIgb2JqZWN0S2V5cyA9IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIChvYmopIHtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHJlcy5wdXNoKGtleSk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbmV4cG9ydHMuZGVjb2RlID0gZXhwb3J0cy5wYXJzZSA9IHJlcXVpcmUoJy4vZGVjb2RlJyk7XG5leHBvcnRzLmVuY29kZSA9IGV4cG9ydHMuc3RyaW5naWZ5ID0gcmVxdWlyZSgnLi9lbmNvZGUnKTtcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG52YXIgcHVueWNvZGUgPSByZXF1aXJlKCdwdW55Y29kZScpO1xuXG5leHBvcnRzLnBhcnNlID0gdXJsUGFyc2U7XG5leHBvcnRzLnJlc29sdmUgPSB1cmxSZXNvbHZlO1xuZXhwb3J0cy5yZXNvbHZlT2JqZWN0ID0gdXJsUmVzb2x2ZU9iamVjdDtcbmV4cG9ydHMuZm9ybWF0ID0gdXJsRm9ybWF0O1xuXG5leHBvcnRzLlVybCA9IFVybDtcblxuZnVuY3Rpb24gVXJsKCkge1xuICB0aGlzLnByb3RvY29sID0gbnVsbDtcbiAgdGhpcy5zbGFzaGVzID0gbnVsbDtcbiAgdGhpcy5hdXRoID0gbnVsbDtcbiAgdGhpcy5ob3N0ID0gbnVsbDtcbiAgdGhpcy5wb3J0ID0gbnVsbDtcbiAgdGhpcy5ob3N0bmFtZSA9IG51bGw7XG4gIHRoaXMuaGFzaCA9IG51bGw7XG4gIHRoaXMuc2VhcmNoID0gbnVsbDtcbiAgdGhpcy5xdWVyeSA9IG51bGw7XG4gIHRoaXMucGF0aG5hbWUgPSBudWxsO1xuICB0aGlzLnBhdGggPSBudWxsO1xuICB0aGlzLmhyZWYgPSBudWxsO1xufVxuXG4vLyBSZWZlcmVuY2U6IFJGQyAzOTg2LCBSRkMgMTgwOCwgUkZDIDIzOTZcblxuLy8gZGVmaW5lIHRoZXNlIGhlcmUgc28gYXQgbGVhc3QgdGhleSBvbmx5IGhhdmUgdG8gYmVcbi8vIGNvbXBpbGVkIG9uY2Ugb24gdGhlIGZpcnN0IG1vZHVsZSBsb2FkLlxudmFyIHByb3RvY29sUGF0dGVybiA9IC9eKFthLXowLTkuKy1dKzopL2ksXG4gICAgcG9ydFBhdHRlcm4gPSAvOlswLTldKiQvLFxuXG4gICAgLy8gUkZDIDIzOTY6IGNoYXJhY3RlcnMgcmVzZXJ2ZWQgZm9yIGRlbGltaXRpbmcgVVJMcy5cbiAgICAvLyBXZSBhY3R1YWxseSBqdXN0IGF1dG8tZXNjYXBlIHRoZXNlLlxuICAgIGRlbGltcyA9IFsnPCcsICc+JywgJ1wiJywgJ2AnLCAnICcsICdcXHInLCAnXFxuJywgJ1xcdCddLFxuXG4gICAgLy8gUkZDIDIzOTY6IGNoYXJhY3RlcnMgbm90IGFsbG93ZWQgZm9yIHZhcmlvdXMgcmVhc29ucy5cbiAgICB1bndpc2UgPSBbJ3snLCAnfScsICd8JywgJ1xcXFwnLCAnXicsICdgJ10uY29uY2F0KGRlbGltcyksXG5cbiAgICAvLyBBbGxvd2VkIGJ5IFJGQ3MsIGJ1dCBjYXVzZSBvZiBYU1MgYXR0YWNrcy4gIEFsd2F5cyBlc2NhcGUgdGhlc2UuXG4gICAgYXV0b0VzY2FwZSA9IFsnXFwnJ10uY29uY2F0KHVud2lzZSksXG4gICAgLy8gQ2hhcmFjdGVycyB0aGF0IGFyZSBuZXZlciBldmVyIGFsbG93ZWQgaW4gYSBob3N0bmFtZS5cbiAgICAvLyBOb3RlIHRoYXQgYW55IGludmFsaWQgY2hhcnMgYXJlIGFsc28gaGFuZGxlZCwgYnV0IHRoZXNlXG4gICAgLy8gYXJlIHRoZSBvbmVzIHRoYXQgYXJlICpleHBlY3RlZCogdG8gYmUgc2Vlbiwgc28gd2UgZmFzdC1wYXRoXG4gICAgLy8gdGhlbS5cbiAgICBub25Ib3N0Q2hhcnMgPSBbJyUnLCAnLycsICc/JywgJzsnLCAnIyddLmNvbmNhdChhdXRvRXNjYXBlKSxcbiAgICBob3N0RW5kaW5nQ2hhcnMgPSBbJy8nLCAnPycsICcjJ10sXG4gICAgaG9zdG5hbWVNYXhMZW4gPSAyNTUsXG4gICAgaG9zdG5hbWVQYXJ0UGF0dGVybiA9IC9eW2EtejAtOUEtWl8tXXswLDYzfSQvLFxuICAgIGhvc3RuYW1lUGFydFN0YXJ0ID0gL14oW2EtejAtOUEtWl8tXXswLDYzfSkoLiopJC8sXG4gICAgLy8gcHJvdG9jb2xzIHRoYXQgY2FuIGFsbG93IFwidW5zYWZlXCIgYW5kIFwidW53aXNlXCIgY2hhcnMuXG4gICAgdW5zYWZlUHJvdG9jb2wgPSB7XG4gICAgICAnamF2YXNjcmlwdCc6IHRydWUsXG4gICAgICAnamF2YXNjcmlwdDonOiB0cnVlXG4gICAgfSxcbiAgICAvLyBwcm90b2NvbHMgdGhhdCBuZXZlciBoYXZlIGEgaG9zdG5hbWUuXG4gICAgaG9zdGxlc3NQcm90b2NvbCA9IHtcbiAgICAgICdqYXZhc2NyaXB0JzogdHJ1ZSxcbiAgICAgICdqYXZhc2NyaXB0Oic6IHRydWVcbiAgICB9LFxuICAgIC8vIHByb3RvY29scyB0aGF0IGFsd2F5cyBjb250YWluIGEgLy8gYml0LlxuICAgIHNsYXNoZWRQcm90b2NvbCA9IHtcbiAgICAgICdodHRwJzogdHJ1ZSxcbiAgICAgICdodHRwcyc6IHRydWUsXG4gICAgICAnZnRwJzogdHJ1ZSxcbiAgICAgICdnb3BoZXInOiB0cnVlLFxuICAgICAgJ2ZpbGUnOiB0cnVlLFxuICAgICAgJ2h0dHA6JzogdHJ1ZSxcbiAgICAgICdodHRwczonOiB0cnVlLFxuICAgICAgJ2Z0cDonOiB0cnVlLFxuICAgICAgJ2dvcGhlcjonOiB0cnVlLFxuICAgICAgJ2ZpbGU6JzogdHJ1ZVxuICAgIH0sXG4gICAgcXVlcnlzdHJpbmcgPSByZXF1aXJlKCdxdWVyeXN0cmluZycpO1xuXG5mdW5jdGlvbiB1cmxQYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gIGlmICh1cmwgJiYgaXNPYmplY3QodXJsKSAmJiB1cmwgaW5zdGFuY2VvZiBVcmwpIHJldHVybiB1cmw7XG5cbiAgdmFyIHUgPSBuZXcgVXJsO1xuICB1LnBhcnNlKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpO1xuICByZXR1cm4gdTtcbn1cblxuVXJsLnByb3RvdHlwZS5wYXJzZSA9IGZ1bmN0aW9uKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgaWYgKCFpc1N0cmluZyh1cmwpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlBhcmFtZXRlciAndXJsJyBtdXN0IGJlIGEgc3RyaW5nLCBub3QgXCIgKyB0eXBlb2YgdXJsKTtcbiAgfVxuXG4gIHZhciByZXN0ID0gdXJsO1xuXG4gIC8vIHRyaW0gYmVmb3JlIHByb2NlZWRpbmcuXG4gIC8vIFRoaXMgaXMgdG8gc3VwcG9ydCBwYXJzZSBzdHVmZiBsaWtlIFwiICBodHRwOi8vZm9vLmNvbSAgXFxuXCJcbiAgcmVzdCA9IHJlc3QudHJpbSgpO1xuXG4gIHZhciBwcm90byA9IHByb3RvY29sUGF0dGVybi5leGVjKHJlc3QpO1xuICBpZiAocHJvdG8pIHtcbiAgICBwcm90byA9IHByb3RvWzBdO1xuICAgIHZhciBsb3dlclByb3RvID0gcHJvdG8udG9Mb3dlckNhc2UoKTtcbiAgICB0aGlzLnByb3RvY29sID0gbG93ZXJQcm90bztcbiAgICByZXN0ID0gcmVzdC5zdWJzdHIocHJvdG8ubGVuZ3RoKTtcbiAgfVxuXG4gIC8vIGZpZ3VyZSBvdXQgaWYgaXQncyBnb3QgYSBob3N0XG4gIC8vIHVzZXJAc2VydmVyIGlzICphbHdheXMqIGludGVycHJldGVkIGFzIGEgaG9zdG5hbWUsIGFuZCB1cmxcbiAgLy8gcmVzb2x1dGlvbiB3aWxsIHRyZWF0IC8vZm9vL2JhciBhcyBob3N0PWZvbyxwYXRoPWJhciBiZWNhdXNlIHRoYXQnc1xuICAvLyBob3cgdGhlIGJyb3dzZXIgcmVzb2x2ZXMgcmVsYXRpdmUgVVJMcy5cbiAgaWYgKHNsYXNoZXNEZW5vdGVIb3N0IHx8IHByb3RvIHx8IHJlc3QubWF0Y2goL15cXC9cXC9bXkBcXC9dK0BbXkBcXC9dKy8pKSB7XG4gICAgdmFyIHNsYXNoZXMgPSByZXN0LnN1YnN0cigwLCAyKSA9PT0gJy8vJztcbiAgICBpZiAoc2xhc2hlcyAmJiAhKHByb3RvICYmIGhvc3RsZXNzUHJvdG9jb2xbcHJvdG9dKSkge1xuICAgICAgcmVzdCA9IHJlc3Quc3Vic3RyKDIpO1xuICAgICAgdGhpcy5zbGFzaGVzID0gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAoIWhvc3RsZXNzUHJvdG9jb2xbcHJvdG9dICYmXG4gICAgICAoc2xhc2hlcyB8fCAocHJvdG8gJiYgIXNsYXNoZWRQcm90b2NvbFtwcm90b10pKSkge1xuXG4gICAgLy8gdGhlcmUncyBhIGhvc3RuYW1lLlxuICAgIC8vIHRoZSBmaXJzdCBpbnN0YW5jZSBvZiAvLCA/LCA7LCBvciAjIGVuZHMgdGhlIGhvc3QuXG4gICAgLy9cbiAgICAvLyBJZiB0aGVyZSBpcyBhbiBAIGluIHRoZSBob3N0bmFtZSwgdGhlbiBub24taG9zdCBjaGFycyAqYXJlKiBhbGxvd2VkXG4gICAgLy8gdG8gdGhlIGxlZnQgb2YgdGhlIGxhc3QgQCBzaWduLCB1bmxlc3Mgc29tZSBob3N0LWVuZGluZyBjaGFyYWN0ZXJcbiAgICAvLyBjb21lcyAqYmVmb3JlKiB0aGUgQC1zaWduLlxuICAgIC8vIFVSTHMgYXJlIG9ibm94aW91cy5cbiAgICAvL1xuICAgIC8vIGV4OlxuICAgIC8vIGh0dHA6Ly9hQGJAYy8gPT4gdXNlcjphQGIgaG9zdDpjXG4gICAgLy8gaHR0cDovL2FAYj9AYyA9PiB1c2VyOmEgaG9zdDpjIHBhdGg6Lz9AY1xuXG4gICAgLy8gdjAuMTIgVE9ETyhpc2FhY3MpOiBUaGlzIGlzIG5vdCBxdWl0ZSBob3cgQ2hyb21lIGRvZXMgdGhpbmdzLlxuICAgIC8vIFJldmlldyBvdXIgdGVzdCBjYXNlIGFnYWluc3QgYnJvd3NlcnMgbW9yZSBjb21wcmVoZW5zaXZlbHkuXG5cbiAgICAvLyBmaW5kIHRoZSBmaXJzdCBpbnN0YW5jZSBvZiBhbnkgaG9zdEVuZGluZ0NoYXJzXG4gICAgdmFyIGhvc3RFbmQgPSAtMTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGhvc3RFbmRpbmdDaGFycy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGhlYyA9IHJlc3QuaW5kZXhPZihob3N0RW5kaW5nQ2hhcnNbaV0pO1xuICAgICAgaWYgKGhlYyAhPT0gLTEgJiYgKGhvc3RFbmQgPT09IC0xIHx8IGhlYyA8IGhvc3RFbmQpKVxuICAgICAgICBob3N0RW5kID0gaGVjO1xuICAgIH1cblxuICAgIC8vIGF0IHRoaXMgcG9pbnQsIGVpdGhlciB3ZSBoYXZlIGFuIGV4cGxpY2l0IHBvaW50IHdoZXJlIHRoZVxuICAgIC8vIGF1dGggcG9ydGlvbiBjYW5ub3QgZ28gcGFzdCwgb3IgdGhlIGxhc3QgQCBjaGFyIGlzIHRoZSBkZWNpZGVyLlxuICAgIHZhciBhdXRoLCBhdFNpZ247XG4gICAgaWYgKGhvc3RFbmQgPT09IC0xKSB7XG4gICAgICAvLyBhdFNpZ24gY2FuIGJlIGFueXdoZXJlLlxuICAgICAgYXRTaWduID0gcmVzdC5sYXN0SW5kZXhPZignQCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBhdFNpZ24gbXVzdCBiZSBpbiBhdXRoIHBvcnRpb24uXG4gICAgICAvLyBodHRwOi8vYUBiL2NAZCA9PiBob3N0OmIgYXV0aDphIHBhdGg6L2NAZFxuICAgICAgYXRTaWduID0gcmVzdC5sYXN0SW5kZXhPZignQCcsIGhvc3RFbmQpO1xuICAgIH1cblxuICAgIC8vIE5vdyB3ZSBoYXZlIGEgcG9ydGlvbiB3aGljaCBpcyBkZWZpbml0ZWx5IHRoZSBhdXRoLlxuICAgIC8vIFB1bGwgdGhhdCBvZmYuXG4gICAgaWYgKGF0U2lnbiAhPT0gLTEpIHtcbiAgICAgIGF1dGggPSByZXN0LnNsaWNlKDAsIGF0U2lnbik7XG4gICAgICByZXN0ID0gcmVzdC5zbGljZShhdFNpZ24gKyAxKTtcbiAgICAgIHRoaXMuYXV0aCA9IGRlY29kZVVSSUNvbXBvbmVudChhdXRoKTtcbiAgICB9XG5cbiAgICAvLyB0aGUgaG9zdCBpcyB0aGUgcmVtYWluaW5nIHRvIHRoZSBsZWZ0IG9mIHRoZSBmaXJzdCBub24taG9zdCBjaGFyXG4gICAgaG9zdEVuZCA9IC0xO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbm9uSG9zdENoYXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgaGVjID0gcmVzdC5pbmRleE9mKG5vbkhvc3RDaGFyc1tpXSk7XG4gICAgICBpZiAoaGVjICE9PSAtMSAmJiAoaG9zdEVuZCA9PT0gLTEgfHwgaGVjIDwgaG9zdEVuZCkpXG4gICAgICAgIGhvc3RFbmQgPSBoZWM7XG4gICAgfVxuICAgIC8vIGlmIHdlIHN0aWxsIGhhdmUgbm90IGhpdCBpdCwgdGhlbiB0aGUgZW50aXJlIHRoaW5nIGlzIGEgaG9zdC5cbiAgICBpZiAoaG9zdEVuZCA9PT0gLTEpXG4gICAgICBob3N0RW5kID0gcmVzdC5sZW5ndGg7XG5cbiAgICB0aGlzLmhvc3QgPSByZXN0LnNsaWNlKDAsIGhvc3RFbmQpO1xuICAgIHJlc3QgPSByZXN0LnNsaWNlKGhvc3RFbmQpO1xuXG4gICAgLy8gcHVsbCBvdXQgcG9ydC5cbiAgICB0aGlzLnBhcnNlSG9zdCgpO1xuXG4gICAgLy8gd2UndmUgaW5kaWNhdGVkIHRoYXQgdGhlcmUgaXMgYSBob3N0bmFtZSxcbiAgICAvLyBzbyBldmVuIGlmIGl0J3MgZW1wdHksIGl0IGhhcyB0byBiZSBwcmVzZW50LlxuICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lIHx8ICcnO1xuXG4gICAgLy8gaWYgaG9zdG5hbWUgYmVnaW5zIHdpdGggWyBhbmQgZW5kcyB3aXRoIF1cbiAgICAvLyBhc3N1bWUgdGhhdCBpdCdzIGFuIElQdjYgYWRkcmVzcy5cbiAgICB2YXIgaXB2Nkhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZVswXSA9PT0gJ1snICYmXG4gICAgICAgIHRoaXMuaG9zdG5hbWVbdGhpcy5ob3N0bmFtZS5sZW5ndGggLSAxXSA9PT0gJ10nO1xuXG4gICAgLy8gdmFsaWRhdGUgYSBsaXR0bGUuXG4gICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIHZhciBob3N0cGFydHMgPSB0aGlzLmhvc3RuYW1lLnNwbGl0KC9cXC4vKTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gaG9zdHBhcnRzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXIgcGFydCA9IGhvc3RwYXJ0c1tpXTtcbiAgICAgICAgaWYgKCFwYXJ0KSBjb250aW51ZTtcbiAgICAgICAgaWYgKCFwYXJ0Lm1hdGNoKGhvc3RuYW1lUGFydFBhdHRlcm4pKSB7XG4gICAgICAgICAgdmFyIG5ld3BhcnQgPSAnJztcbiAgICAgICAgICBmb3IgKHZhciBqID0gMCwgayA9IHBhcnQubGVuZ3RoOyBqIDwgazsgaisrKSB7XG4gICAgICAgICAgICBpZiAocGFydC5jaGFyQ29kZUF0KGopID4gMTI3KSB7XG4gICAgICAgICAgICAgIC8vIHdlIHJlcGxhY2Ugbm9uLUFTQ0lJIGNoYXIgd2l0aCBhIHRlbXBvcmFyeSBwbGFjZWhvbGRlclxuICAgICAgICAgICAgICAvLyB3ZSBuZWVkIHRoaXMgdG8gbWFrZSBzdXJlIHNpemUgb2YgaG9zdG5hbWUgaXMgbm90XG4gICAgICAgICAgICAgIC8vIGJyb2tlbiBieSByZXBsYWNpbmcgbm9uLUFTQ0lJIGJ5IG5vdGhpbmdcbiAgICAgICAgICAgICAgbmV3cGFydCArPSAneCc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBuZXdwYXJ0ICs9IHBhcnRbal07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIHdlIHRlc3QgYWdhaW4gd2l0aCBBU0NJSSBjaGFyIG9ubHlcbiAgICAgICAgICBpZiAoIW5ld3BhcnQubWF0Y2goaG9zdG5hbWVQYXJ0UGF0dGVybikpIHtcbiAgICAgICAgICAgIHZhciB2YWxpZFBhcnRzID0gaG9zdHBhcnRzLnNsaWNlKDAsIGkpO1xuICAgICAgICAgICAgdmFyIG5vdEhvc3QgPSBob3N0cGFydHMuc2xpY2UoaSArIDEpO1xuICAgICAgICAgICAgdmFyIGJpdCA9IHBhcnQubWF0Y2goaG9zdG5hbWVQYXJ0U3RhcnQpO1xuICAgICAgICAgICAgaWYgKGJpdCkge1xuICAgICAgICAgICAgICB2YWxpZFBhcnRzLnB1c2goYml0WzFdKTtcbiAgICAgICAgICAgICAgbm90SG9zdC51bnNoaWZ0KGJpdFsyXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobm90SG9zdC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgcmVzdCA9ICcvJyArIG5vdEhvc3Quam9pbignLicpICsgcmVzdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuaG9zdG5hbWUgPSB2YWxpZFBhcnRzLmpvaW4oJy4nKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0aGlzLmhvc3RuYW1lLmxlbmd0aCA+IGhvc3RuYW1lTWF4TGVuKSB7XG4gICAgICB0aGlzLmhvc3RuYW1lID0gJyc7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIGhvc3RuYW1lcyBhcmUgYWx3YXlzIGxvd2VyIGNhc2UuXG4gICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgIH1cblxuICAgIGlmICghaXB2Nkhvc3RuYW1lKSB7XG4gICAgICAvLyBJRE5BIFN1cHBvcnQ6IFJldHVybnMgYSBwdW55IGNvZGVkIHJlcHJlc2VudGF0aW9uIG9mIFwiZG9tYWluXCIuXG4gICAgICAvLyBJdCBvbmx5IGNvbnZlcnRzIHRoZSBwYXJ0IG9mIHRoZSBkb21haW4gbmFtZSB0aGF0XG4gICAgICAvLyBoYXMgbm9uIEFTQ0lJIGNoYXJhY3RlcnMuIEkuZS4gaXQgZG9zZW50IG1hdHRlciBpZlxuICAgICAgLy8geW91IGNhbGwgaXQgd2l0aCBhIGRvbWFpbiB0aGF0IGFscmVhZHkgaXMgaW4gQVNDSUkuXG4gICAgICB2YXIgZG9tYWluQXJyYXkgPSB0aGlzLmhvc3RuYW1lLnNwbGl0KCcuJyk7XG4gICAgICB2YXIgbmV3T3V0ID0gW107XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRvbWFpbkFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBzID0gZG9tYWluQXJyYXlbaV07XG4gICAgICAgIG5ld091dC5wdXNoKHMubWF0Y2goL1teQS1aYS16MC05Xy1dLykgP1xuICAgICAgICAgICAgJ3huLS0nICsgcHVueWNvZGUuZW5jb2RlKHMpIDogcyk7XG4gICAgICB9XG4gICAgICB0aGlzLmhvc3RuYW1lID0gbmV3T3V0LmpvaW4oJy4nKTtcbiAgICB9XG5cbiAgICB2YXIgcCA9IHRoaXMucG9ydCA/ICc6JyArIHRoaXMucG9ydCA6ICcnO1xuICAgIHZhciBoID0gdGhpcy5ob3N0bmFtZSB8fCAnJztcbiAgICB0aGlzLmhvc3QgPSBoICsgcDtcbiAgICB0aGlzLmhyZWYgKz0gdGhpcy5ob3N0O1xuXG4gICAgLy8gc3RyaXAgWyBhbmQgXSBmcm9tIHRoZSBob3N0bmFtZVxuICAgIC8vIHRoZSBob3N0IGZpZWxkIHN0aWxsIHJldGFpbnMgdGhlbSwgdGhvdWdoXG4gICAgaWYgKGlwdjZIb3N0bmFtZSkge1xuICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWUuc3Vic3RyKDEsIHRoaXMuaG9zdG5hbWUubGVuZ3RoIC0gMik7XG4gICAgICBpZiAocmVzdFswXSAhPT0gJy8nKSB7XG4gICAgICAgIHJlc3QgPSAnLycgKyByZXN0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIG5vdyByZXN0IGlzIHNldCB0byB0aGUgcG9zdC1ob3N0IHN0dWZmLlxuICAvLyBjaG9wIG9mZiBhbnkgZGVsaW0gY2hhcnMuXG4gIGlmICghdW5zYWZlUHJvdG9jb2xbbG93ZXJQcm90b10pIHtcblxuICAgIC8vIEZpcnN0LCBtYWtlIDEwMCUgc3VyZSB0aGF0IGFueSBcImF1dG9Fc2NhcGVcIiBjaGFycyBnZXRcbiAgICAvLyBlc2NhcGVkLCBldmVuIGlmIGVuY29kZVVSSUNvbXBvbmVudCBkb2Vzbid0IHRoaW5rIHRoZXlcbiAgICAvLyBuZWVkIHRvIGJlLlxuICAgIGZvciAodmFyIGkgPSAwLCBsID0gYXV0b0VzY2FwZS5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIHZhciBhZSA9IGF1dG9Fc2NhcGVbaV07XG4gICAgICB2YXIgZXNjID0gZW5jb2RlVVJJQ29tcG9uZW50KGFlKTtcbiAgICAgIGlmIChlc2MgPT09IGFlKSB7XG4gICAgICAgIGVzYyA9IGVzY2FwZShhZSk7XG4gICAgICB9XG4gICAgICByZXN0ID0gcmVzdC5zcGxpdChhZSkuam9pbihlc2MpO1xuICAgIH1cbiAgfVxuXG5cbiAgLy8gY2hvcCBvZmYgZnJvbSB0aGUgdGFpbCBmaXJzdC5cbiAgdmFyIGhhc2ggPSByZXN0LmluZGV4T2YoJyMnKTtcbiAgaWYgKGhhc2ggIT09IC0xKSB7XG4gICAgLy8gZ290IGEgZnJhZ21lbnQgc3RyaW5nLlxuICAgIHRoaXMuaGFzaCA9IHJlc3Quc3Vic3RyKGhhc2gpO1xuICAgIHJlc3QgPSByZXN0LnNsaWNlKDAsIGhhc2gpO1xuICB9XG4gIHZhciBxbSA9IHJlc3QuaW5kZXhPZignPycpO1xuICBpZiAocW0gIT09IC0xKSB7XG4gICAgdGhpcy5zZWFyY2ggPSByZXN0LnN1YnN0cihxbSk7XG4gICAgdGhpcy5xdWVyeSA9IHJlc3Quc3Vic3RyKHFtICsgMSk7XG4gICAgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZSh0aGlzLnF1ZXJ5KTtcbiAgICB9XG4gICAgcmVzdCA9IHJlc3Quc2xpY2UoMCwgcW0pO1xuICB9IGVsc2UgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAvLyBubyBxdWVyeSBzdHJpbmcsIGJ1dCBwYXJzZVF1ZXJ5U3RyaW5nIHN0aWxsIHJlcXVlc3RlZFxuICAgIHRoaXMuc2VhcmNoID0gJyc7XG4gICAgdGhpcy5xdWVyeSA9IHt9O1xuICB9XG4gIGlmIChyZXN0KSB0aGlzLnBhdGhuYW1lID0gcmVzdDtcbiAgaWYgKHNsYXNoZWRQcm90b2NvbFtsb3dlclByb3RvXSAmJlxuICAgICAgdGhpcy5ob3N0bmFtZSAmJiAhdGhpcy5wYXRobmFtZSkge1xuICAgIHRoaXMucGF0aG5hbWUgPSAnLyc7XG4gIH1cblxuICAvL3RvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gIGlmICh0aGlzLnBhdGhuYW1lIHx8IHRoaXMuc2VhcmNoKSB7XG4gICAgdmFyIHAgPSB0aGlzLnBhdGhuYW1lIHx8ICcnO1xuICAgIHZhciBzID0gdGhpcy5zZWFyY2ggfHwgJyc7XG4gICAgdGhpcy5wYXRoID0gcCArIHM7XG4gIH1cblxuICAvLyBmaW5hbGx5LCByZWNvbnN0cnVjdCB0aGUgaHJlZiBiYXNlZCBvbiB3aGF0IGhhcyBiZWVuIHZhbGlkYXRlZC5cbiAgdGhpcy5ocmVmID0gdGhpcy5mb3JtYXQoKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBmb3JtYXQgYSBwYXJzZWQgb2JqZWN0IGludG8gYSB1cmwgc3RyaW5nXG5mdW5jdGlvbiB1cmxGb3JtYXQob2JqKSB7XG4gIC8vIGVuc3VyZSBpdCdzIGFuIG9iamVjdCwgYW5kIG5vdCBhIHN0cmluZyB1cmwuXG4gIC8vIElmIGl0J3MgYW4gb2JqLCB0aGlzIGlzIGEgbm8tb3AuXG4gIC8vIHRoaXMgd2F5LCB5b3UgY2FuIGNhbGwgdXJsX2Zvcm1hdCgpIG9uIHN0cmluZ3NcbiAgLy8gdG8gY2xlYW4gdXAgcG90ZW50aWFsbHkgd29ua3kgdXJscy5cbiAgaWYgKGlzU3RyaW5nKG9iaikpIG9iaiA9IHVybFBhcnNlKG9iaik7XG4gIGlmICghKG9iaiBpbnN0YW5jZW9mIFVybCkpIHJldHVybiBVcmwucHJvdG90eXBlLmZvcm1hdC5jYWxsKG9iaik7XG4gIHJldHVybiBvYmouZm9ybWF0KCk7XG59XG5cblVybC5wcm90b3R5cGUuZm9ybWF0ID0gZnVuY3Rpb24oKSB7XG4gIHZhciBhdXRoID0gdGhpcy5hdXRoIHx8ICcnO1xuICBpZiAoYXV0aCkge1xuICAgIGF1dGggPSBlbmNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgYXV0aCA9IGF1dGgucmVwbGFjZSgvJTNBL2ksICc6Jyk7XG4gICAgYXV0aCArPSAnQCc7XG4gIH1cblxuICB2YXIgcHJvdG9jb2wgPSB0aGlzLnByb3RvY29sIHx8ICcnLFxuICAgICAgcGF0aG5hbWUgPSB0aGlzLnBhdGhuYW1lIHx8ICcnLFxuICAgICAgaGFzaCA9IHRoaXMuaGFzaCB8fCAnJyxcbiAgICAgIGhvc3QgPSBmYWxzZSxcbiAgICAgIHF1ZXJ5ID0gJyc7XG5cbiAgaWYgKHRoaXMuaG9zdCkge1xuICAgIGhvc3QgPSBhdXRoICsgdGhpcy5ob3N0O1xuICB9IGVsc2UgaWYgKHRoaXMuaG9zdG5hbWUpIHtcbiAgICBob3N0ID0gYXV0aCArICh0aGlzLmhvc3RuYW1lLmluZGV4T2YoJzonKSA9PT0gLTEgP1xuICAgICAgICB0aGlzLmhvc3RuYW1lIDpcbiAgICAgICAgJ1snICsgdGhpcy5ob3N0bmFtZSArICddJyk7XG4gICAgaWYgKHRoaXMucG9ydCkge1xuICAgICAgaG9zdCArPSAnOicgKyB0aGlzLnBvcnQ7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkgJiZcbiAgICAgIGlzT2JqZWN0KHRoaXMucXVlcnkpICYmXG4gICAgICBPYmplY3Qua2V5cyh0aGlzLnF1ZXJ5KS5sZW5ndGgpIHtcbiAgICBxdWVyeSA9IHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeSh0aGlzLnF1ZXJ5KTtcbiAgfVxuXG4gIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaCB8fCAocXVlcnkgJiYgKCc/JyArIHF1ZXJ5KSkgfHwgJyc7XG5cbiAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLnN1YnN0cigtMSkgIT09ICc6JykgcHJvdG9jb2wgKz0gJzonO1xuXG4gIC8vIG9ubHkgdGhlIHNsYXNoZWRQcm90b2NvbHMgZ2V0IHRoZSAvLy4gIE5vdCBtYWlsdG86LCB4bXBwOiwgZXRjLlxuICAvLyB1bmxlc3MgdGhleSBoYWQgdGhlbSB0byBiZWdpbiB3aXRoLlxuICBpZiAodGhpcy5zbGFzaGVzIHx8XG4gICAgICAoIXByb3RvY29sIHx8IHNsYXNoZWRQcm90b2NvbFtwcm90b2NvbF0pICYmIGhvc3QgIT09IGZhbHNlKSB7XG4gICAgaG9zdCA9ICcvLycgKyAoaG9zdCB8fCAnJyk7XG4gICAgaWYgKHBhdGhuYW1lICYmIHBhdGhuYW1lLmNoYXJBdCgwKSAhPT0gJy8nKSBwYXRobmFtZSA9ICcvJyArIHBhdGhuYW1lO1xuICB9IGVsc2UgaWYgKCFob3N0KSB7XG4gICAgaG9zdCA9ICcnO1xuICB9XG5cbiAgaWYgKGhhc2ggJiYgaGFzaC5jaGFyQXQoMCkgIT09ICcjJykgaGFzaCA9ICcjJyArIGhhc2g7XG4gIGlmIChzZWFyY2ggJiYgc2VhcmNoLmNoYXJBdCgwKSAhPT0gJz8nKSBzZWFyY2ggPSAnPycgKyBzZWFyY2g7XG5cbiAgcGF0aG5hbWUgPSBwYXRobmFtZS5yZXBsYWNlKC9bPyNdL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChtYXRjaCk7XG4gIH0pO1xuICBzZWFyY2ggPSBzZWFyY2gucmVwbGFjZSgnIycsICclMjMnKTtcblxuICByZXR1cm4gcHJvdG9jb2wgKyBob3N0ICsgcGF0aG5hbWUgKyBzZWFyY2ggKyBoYXNoO1xufTtcblxuZnVuY3Rpb24gdXJsUmVzb2x2ZShzb3VyY2UsIHJlbGF0aXZlKSB7XG4gIHJldHVybiB1cmxQYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHJlbGF0aXZlKTtcbn1cblxuVXJsLnByb3RvdHlwZS5yZXNvbHZlID0gZnVuY3Rpb24ocmVsYXRpdmUpIHtcbiAgcmV0dXJuIHRoaXMucmVzb2x2ZU9iamVjdCh1cmxQYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpKS5mb3JtYXQoKTtcbn07XG5cbmZ1bmN0aW9uIHVybFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICBpZiAoIXNvdXJjZSkgcmV0dXJuIHJlbGF0aXZlO1xuICByZXR1cm4gdXJsUGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZU9iamVjdChyZWxhdGl2ZSk7XG59XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZU9iamVjdCA9IGZ1bmN0aW9uKHJlbGF0aXZlKSB7XG4gIGlmIChpc1N0cmluZyhyZWxhdGl2ZSkpIHtcbiAgICB2YXIgcmVsID0gbmV3IFVybCgpO1xuICAgIHJlbC5wYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpO1xuICAgIHJlbGF0aXZlID0gcmVsO1xuICB9XG5cbiAgdmFyIHJlc3VsdCA9IG5ldyBVcmwoKTtcbiAgT2JqZWN0LmtleXModGhpcykuZm9yRWFjaChmdW5jdGlvbihrKSB7XG4gICAgcmVzdWx0W2tdID0gdGhpc1trXTtcbiAgfSwgdGhpcyk7XG5cbiAgLy8gaGFzaCBpcyBhbHdheXMgb3ZlcnJpZGRlbiwgbm8gbWF0dGVyIHdoYXQuXG4gIC8vIGV2ZW4gaHJlZj1cIlwiIHdpbGwgcmVtb3ZlIGl0LlxuICByZXN1bHQuaGFzaCA9IHJlbGF0aXZlLmhhc2g7XG5cbiAgLy8gaWYgdGhlIHJlbGF0aXZlIHVybCBpcyBlbXB0eSwgdGhlbiB0aGVyZSdzIG5vdGhpbmcgbGVmdCB0byBkbyBoZXJlLlxuICBpZiAocmVsYXRpdmUuaHJlZiA9PT0gJycpIHtcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gaHJlZnMgbGlrZSAvL2Zvby9iYXIgYWx3YXlzIGN1dCB0byB0aGUgcHJvdG9jb2wuXG4gIGlmIChyZWxhdGl2ZS5zbGFzaGVzICYmICFyZWxhdGl2ZS5wcm90b2NvbCkge1xuICAgIC8vIHRha2UgZXZlcnl0aGluZyBleGNlcHQgdGhlIHByb3RvY29sIGZyb20gcmVsYXRpdmVcbiAgICBPYmplY3Qua2V5cyhyZWxhdGl2ZSkuZm9yRWFjaChmdW5jdGlvbihrKSB7XG4gICAgICBpZiAoayAhPT0gJ3Byb3RvY29sJylcbiAgICAgICAgcmVzdWx0W2tdID0gcmVsYXRpdmVba107XG4gICAgfSk7XG5cbiAgICAvL3VybFBhcnNlIGFwcGVuZHMgdHJhaWxpbmcgLyB0byB1cmxzIGxpa2UgaHR0cDovL3d3dy5leGFtcGxlLmNvbVxuICAgIGlmIChzbGFzaGVkUHJvdG9jb2xbcmVzdWx0LnByb3RvY29sXSAmJlxuICAgICAgICByZXN1bHQuaG9zdG5hbWUgJiYgIXJlc3VsdC5wYXRobmFtZSkge1xuICAgICAgcmVzdWx0LnBhdGggPSByZXN1bHQucGF0aG5hbWUgPSAnLyc7XG4gICAgfVxuXG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGlmIChyZWxhdGl2ZS5wcm90b2NvbCAmJiByZWxhdGl2ZS5wcm90b2NvbCAhPT0gcmVzdWx0LnByb3RvY29sKSB7XG4gICAgLy8gaWYgaXQncyBhIGtub3duIHVybCBwcm90b2NvbCwgdGhlbiBjaGFuZ2luZ1xuICAgIC8vIHRoZSBwcm90b2NvbCBkb2VzIHdlaXJkIHRoaW5nc1xuICAgIC8vIGZpcnN0LCBpZiBpdCdzIG5vdCBmaWxlOiwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBob3N0LFxuICAgIC8vIGFuZCBpZiB0aGVyZSB3YXMgYSBwYXRoXG4gICAgLy8gdG8gYmVnaW4gd2l0aCwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBwYXRoLlxuICAgIC8vIGlmIGl0IGlzIGZpbGU6LCB0aGVuIHRoZSBob3N0IGlzIGRyb3BwZWQsXG4gICAgLy8gYmVjYXVzZSB0aGF0J3Mga25vd24gdG8gYmUgaG9zdGxlc3MuXG4gICAgLy8gYW55dGhpbmcgZWxzZSBpcyBhc3N1bWVkIHRvIGJlIGFic29sdXRlLlxuICAgIGlmICghc2xhc2hlZFByb3RvY29sW3JlbGF0aXZlLnByb3RvY29sXSkge1xuICAgICAgT2JqZWN0LmtleXMocmVsYXRpdmUpLmZvckVhY2goZnVuY3Rpb24oaykge1xuICAgICAgICByZXN1bHRba10gPSByZWxhdGl2ZVtrXTtcbiAgICAgIH0pO1xuICAgICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHJlc3VsdC5wcm90b2NvbCA9IHJlbGF0aXZlLnByb3RvY29sO1xuICAgIGlmICghcmVsYXRpdmUuaG9zdCAmJiAhaG9zdGxlc3NQcm90b2NvbFtyZWxhdGl2ZS5wcm90b2NvbF0pIHtcbiAgICAgIHZhciByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lIHx8ICcnKS5zcGxpdCgnLycpO1xuICAgICAgd2hpbGUgKHJlbFBhdGgubGVuZ3RoICYmICEocmVsYXRpdmUuaG9zdCA9IHJlbFBhdGguc2hpZnQoKSkpO1xuICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0KSByZWxhdGl2ZS5ob3N0ID0gJyc7XG4gICAgICBpZiAoIXJlbGF0aXZlLmhvc3RuYW1lKSByZWxhdGl2ZS5ob3N0bmFtZSA9ICcnO1xuICAgICAgaWYgKHJlbFBhdGhbMF0gIT09ICcnKSByZWxQYXRoLnVuc2hpZnQoJycpO1xuICAgICAgaWYgKHJlbFBhdGgubGVuZ3RoIDwgMikgcmVsUGF0aC51bnNoaWZ0KCcnKTtcbiAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbFBhdGguam9pbignLycpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxhdGl2ZS5wYXRobmFtZTtcbiAgICB9XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgICByZXN1bHQuaG9zdCA9IHJlbGF0aXZlLmhvc3QgfHwgJyc7XG4gICAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoO1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3Q7XG4gICAgcmVzdWx0LnBvcnQgPSByZWxhdGl2ZS5wb3J0O1xuICAgIC8vIHRvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gICAgaWYgKHJlc3VsdC5wYXRobmFtZSB8fCByZXN1bHQuc2VhcmNoKSB7XG4gICAgICB2YXIgcCA9IHJlc3VsdC5wYXRobmFtZSB8fCAnJztcbiAgICAgIHZhciBzID0gcmVzdWx0LnNlYXJjaCB8fCAnJztcbiAgICAgIHJlc3VsdC5wYXRoID0gcCArIHM7XG4gICAgfVxuICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgdmFyIGlzU291cmNlQWJzID0gKHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuY2hhckF0KDApID09PSAnLycpLFxuICAgICAgaXNSZWxBYnMgPSAoXG4gICAgICAgICAgcmVsYXRpdmUuaG9zdCB8fFxuICAgICAgICAgIHJlbGF0aXZlLnBhdGhuYW1lICYmIHJlbGF0aXZlLnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nXG4gICAgICApLFxuICAgICAgbXVzdEVuZEFicyA9IChpc1JlbEFicyB8fCBpc1NvdXJjZUFicyB8fFxuICAgICAgICAgICAgICAgICAgICAocmVzdWx0Lmhvc3QgJiYgcmVsYXRpdmUucGF0aG5hbWUpKSxcbiAgICAgIHJlbW92ZUFsbERvdHMgPSBtdXN0RW5kQWJzLFxuICAgICAgc3JjUGF0aCA9IHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuc3BsaXQoJy8nKSB8fCBbXSxcbiAgICAgIHJlbFBhdGggPSByZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdCgnLycpIHx8IFtdLFxuICAgICAgcHN5Y2hvdGljID0gcmVzdWx0LnByb3RvY29sICYmICFzbGFzaGVkUHJvdG9jb2xbcmVzdWx0LnByb3RvY29sXTtcblxuICAvLyBpZiB0aGUgdXJsIGlzIGEgbm9uLXNsYXNoZWQgdXJsLCB0aGVuIHJlbGF0aXZlXG4gIC8vIGxpbmtzIGxpa2UgLi4vLi4gc2hvdWxkIGJlIGFibGVcbiAgLy8gdG8gY3Jhd2wgdXAgdG8gdGhlIGhvc3RuYW1lLCBhcyB3ZWxsLiAgVGhpcyBpcyBzdHJhbmdlLlxuICAvLyByZXN1bHQucHJvdG9jb2wgaGFzIGFscmVhZHkgYmVlbiBzZXQgYnkgbm93LlxuICAvLyBMYXRlciBvbiwgcHV0IHRoZSBmaXJzdCBwYXRoIHBhcnQgaW50byB0aGUgaG9zdCBmaWVsZC5cbiAgaWYgKHBzeWNob3RpYykge1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9ICcnO1xuICAgIHJlc3VsdC5wb3J0ID0gbnVsbDtcbiAgICBpZiAocmVzdWx0Lmhvc3QpIHtcbiAgICAgIGlmIChzcmNQYXRoWzBdID09PSAnJykgc3JjUGF0aFswXSA9IHJlc3VsdC5ob3N0O1xuICAgICAgZWxzZSBzcmNQYXRoLnVuc2hpZnQocmVzdWx0Lmhvc3QpO1xuICAgIH1cbiAgICByZXN1bHQuaG9zdCA9ICcnO1xuICAgIGlmIChyZWxhdGl2ZS5wcm90b2NvbCkge1xuICAgICAgcmVsYXRpdmUuaG9zdG5hbWUgPSBudWxsO1xuICAgICAgcmVsYXRpdmUucG9ydCA9IG51bGw7XG4gICAgICBpZiAocmVsYXRpdmUuaG9zdCkge1xuICAgICAgICBpZiAocmVsUGF0aFswXSA9PT0gJycpIHJlbFBhdGhbMF0gPSByZWxhdGl2ZS5ob3N0O1xuICAgICAgICBlbHNlIHJlbFBhdGgudW5zaGlmdChyZWxhdGl2ZS5ob3N0KTtcbiAgICAgIH1cbiAgICAgIHJlbGF0aXZlLmhvc3QgPSBudWxsO1xuICAgIH1cbiAgICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyAmJiAocmVsUGF0aFswXSA9PT0gJycgfHwgc3JjUGF0aFswXSA9PT0gJycpO1xuICB9XG5cbiAgaWYgKGlzUmVsQWJzKSB7XG4gICAgLy8gaXQncyBhYnNvbHV0ZS5cbiAgICByZXN1bHQuaG9zdCA9IChyZWxhdGl2ZS5ob3N0IHx8IHJlbGF0aXZlLmhvc3QgPT09ICcnKSA/XG4gICAgICAgICAgICAgICAgICByZWxhdGl2ZS5ob3N0IDogcmVzdWx0Lmhvc3Q7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID0gKHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3RuYW1lID09PSAnJykgP1xuICAgICAgICAgICAgICAgICAgICAgIHJlbGF0aXZlLmhvc3RuYW1lIDogcmVzdWx0Lmhvc3RuYW1lO1xuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgc3JjUGF0aCA9IHJlbFBhdGg7XG4gICAgLy8gZmFsbCB0aHJvdWdoIHRvIHRoZSBkb3QtaGFuZGxpbmcgYmVsb3cuXG4gIH0gZWxzZSBpZiAocmVsUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBpdCdzIHJlbGF0aXZlXG4gICAgLy8gdGhyb3cgYXdheSB0aGUgZXhpc3RpbmcgZmlsZSwgYW5kIHRha2UgdGhlIG5ldyBwYXRoIGluc3RlYWQuXG4gICAgaWYgKCFzcmNQYXRoKSBzcmNQYXRoID0gW107XG4gICAgc3JjUGF0aC5wb3AoKTtcbiAgICBzcmNQYXRoID0gc3JjUGF0aC5jb25jYXQocmVsUGF0aCk7XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgfSBlbHNlIGlmICghaXNOdWxsT3JVbmRlZmluZWQocmVsYXRpdmUuc2VhcmNoKSkge1xuICAgIC8vIGp1c3QgcHVsbCBvdXQgdGhlIHNlYXJjaC5cbiAgICAvLyBsaWtlIGhyZWY9Jz9mb28nLlxuICAgIC8vIFB1dCB0aGlzIGFmdGVyIHRoZSBvdGhlciB0d28gY2FzZXMgYmVjYXVzZSBpdCBzaW1wbGlmaWVzIHRoZSBib29sZWFuc1xuICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gc3JjUGF0aC5zaGlmdCgpO1xuICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgICB2YXIgYXV0aEluSG9zdCA9IHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoJ0AnKSA+IDAgP1xuICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQuaG9zdC5zcGxpdCgnQCcpIDogZmFsc2U7XG4gICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmICghaXNOdWxsKHJlc3VsdC5wYXRobmFtZSkgfHwgIWlzTnVsbChyZXN1bHQuc2VhcmNoKSkge1xuICAgICAgcmVzdWx0LnBhdGggPSAocmVzdWx0LnBhdGhuYW1lID8gcmVzdWx0LnBhdGhuYW1lIDogJycpICtcbiAgICAgICAgICAgICAgICAgICAgKHJlc3VsdC5zZWFyY2ggPyByZXN1bHQuc2VhcmNoIDogJycpO1xuICAgIH1cbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgIC8vIG5vIHBhdGggYXQgYWxsLiAgZWFzeS5cbiAgICAvLyB3ZSd2ZSBhbHJlYWR5IGhhbmRsZWQgdGhlIG90aGVyIHN0dWZmIGFib3ZlLlxuICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQuc2VhcmNoKSB7XG4gICAgICByZXN1bHQucGF0aCA9ICcvJyArIHJlc3VsdC5zZWFyY2g7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gbnVsbDtcbiAgICB9XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGlmIGEgdXJsIEVORHMgaW4gLiBvciAuLiwgdGhlbiBpdCBtdXN0IGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAvLyBob3dldmVyLCBpZiBpdCBlbmRzIGluIGFueXRoaW5nIGVsc2Ugbm9uLXNsYXNoeSxcbiAgLy8gdGhlbiBpdCBtdXN0IE5PVCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgdmFyIGxhc3QgPSBzcmNQYXRoLnNsaWNlKC0xKVswXTtcbiAgdmFyIGhhc1RyYWlsaW5nU2xhc2ggPSAoXG4gICAgICAocmVzdWx0Lmhvc3QgfHwgcmVsYXRpdmUuaG9zdCkgJiYgKGxhc3QgPT09ICcuJyB8fCBsYXN0ID09PSAnLi4nKSB8fFxuICAgICAgbGFzdCA9PT0gJycpO1xuXG4gIC8vIHN0cmlwIHNpbmdsZSBkb3RzLCByZXNvbHZlIGRvdWJsZSBkb3RzIHRvIHBhcmVudCBkaXJcbiAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgdmFyIHVwID0gMDtcbiAgZm9yICh2YXIgaSA9IHNyY1BhdGgubGVuZ3RoOyBpID49IDA7IGktLSkge1xuICAgIGxhc3QgPSBzcmNQYXRoW2ldO1xuICAgIGlmIChsYXN0ID09ICcuJykge1xuICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgfSBlbHNlIGlmIChsYXN0ID09PSAnLi4nKSB7XG4gICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgIHVwKys7XG4gICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICB1cC0tO1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXRoIGlzIGFsbG93ZWQgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIHJlc3RvcmUgbGVhZGluZyAuLnNcbiAgaWYgKCFtdXN0RW5kQWJzICYmICFyZW1vdmVBbGxEb3RzKSB7XG4gICAgZm9yICg7IHVwLS07IHVwKSB7XG4gICAgICBzcmNQYXRoLnVuc2hpZnQoJy4uJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKG11c3RFbmRBYnMgJiYgc3JjUGF0aFswXSAhPT0gJycgJiZcbiAgICAgICghc3JjUGF0aFswXSB8fCBzcmNQYXRoWzBdLmNoYXJBdCgwKSAhPT0gJy8nKSkge1xuICAgIHNyY1BhdGgudW5zaGlmdCgnJyk7XG4gIH1cblxuICBpZiAoaGFzVHJhaWxpbmdTbGFzaCAmJiAoc3JjUGF0aC5qb2luKCcvJykuc3Vic3RyKC0xKSAhPT0gJy8nKSkge1xuICAgIHNyY1BhdGgucHVzaCgnJyk7XG4gIH1cblxuICB2YXIgaXNBYnNvbHV0ZSA9IHNyY1BhdGhbMF0gPT09ICcnIHx8XG4gICAgICAoc3JjUGF0aFswXSAmJiBzcmNQYXRoWzBdLmNoYXJBdCgwKSA9PT0gJy8nKTtcblxuICAvLyBwdXQgdGhlIGhvc3QgYmFja1xuICBpZiAocHN5Y2hvdGljKSB7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBpc0Fic29sdXRlID8gJycgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3JjUGF0aC5sZW5ndGggPyBzcmNQYXRoLnNoaWZ0KCkgOiAnJztcbiAgICAvL29jY2F0aW9uYWx5IHRoZSBhdXRoIGNhbiBnZXQgc3R1Y2sgb25seSBpbiBob3N0XG4gICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAvL3VybC5yZXNvbHZlT2JqZWN0KCdtYWlsdG86bG9jYWwxQGRvbWFpbjEnLCAnbG9jYWwyQGRvbWFpbjInKVxuICAgIHZhciBhdXRoSW5Ib3N0ID0gcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZignQCcpID4gMCA/XG4gICAgICAgICAgICAgICAgICAgICByZXN1bHQuaG9zdC5zcGxpdCgnQCcpIDogZmFsc2U7XG4gICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgIHJlc3VsdC5hdXRoID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgfVxuICB9XG5cbiAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHNyY1BhdGgubGVuZ3RoKTtcblxuICBpZiAobXVzdEVuZEFicyAmJiAhaXNBYnNvbHV0ZSkge1xuICAgIHNyY1BhdGgudW5zaGlmdCgnJyk7XG4gIH1cblxuICBpZiAoIXNyY1BhdGgubGVuZ3RoKSB7XG4gICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICByZXN1bHQucGF0aCA9IG51bGw7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0LnBhdGhuYW1lID0gc3JjUGF0aC5qb2luKCcvJyk7XG4gIH1cblxuICAvL3RvIHN1cHBvcnQgcmVxdWVzdC5odHRwXG4gIGlmICghaXNOdWxsKHJlc3VsdC5wYXRobmFtZSkgfHwgIWlzTnVsbChyZXN1bHQuc2VhcmNoKSkge1xuICAgIHJlc3VsdC5wYXRoID0gKHJlc3VsdC5wYXRobmFtZSA/IHJlc3VsdC5wYXRobmFtZSA6ICcnKSArXG4gICAgICAgICAgICAgICAgICAocmVzdWx0LnNlYXJjaCA/IHJlc3VsdC5zZWFyY2ggOiAnJyk7XG4gIH1cbiAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoIHx8IHJlc3VsdC5hdXRoO1xuICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICByZXR1cm4gcmVzdWx0O1xufTtcblxuVXJsLnByb3RvdHlwZS5wYXJzZUhvc3QgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGhvc3QgPSB0aGlzLmhvc3Q7XG4gIHZhciBwb3J0ID0gcG9ydFBhdHRlcm4uZXhlYyhob3N0KTtcbiAgaWYgKHBvcnQpIHtcbiAgICBwb3J0ID0gcG9ydFswXTtcbiAgICBpZiAocG9ydCAhPT0gJzonKSB7XG4gICAgICB0aGlzLnBvcnQgPSBwb3J0LnN1YnN0cigxKTtcbiAgICB9XG4gICAgaG9zdCA9IGhvc3Quc3Vic3RyKDAsIGhvc3QubGVuZ3RoIC0gcG9ydC5sZW5ndGgpO1xuICB9XG4gIGlmIChob3N0KSB0aGlzLmhvc3RuYW1lID0gaG9zdDtcbn07XG5cbmZ1bmN0aW9uIGlzU3RyaW5nKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gXCJzdHJpbmdcIjtcbn1cblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzTnVsbChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbDtcbn1cbmZ1bmN0aW9uIGlzTnVsbE9yVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gIGFyZyA9PSBudWxsO1xufVxuIiwiLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzXG4gKi9cblxudmFyIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgnanNvbnAnKTtcblxuLyoqXG4gKiBNb2R1bGUgZXhwb3J0cy5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGpzb25wO1xuXG4vKipcbiAqIENhbGxiYWNrIGluZGV4LlxuICovXG5cbnZhciBjb3VudCA9IDA7XG5cbi8qKlxuICogTm9vcCBmdW5jdGlvbi5cbiAqL1xuXG5mdW5jdGlvbiBub29wKCl7fVxuXG4vKipcbiAqIEpTT05QIGhhbmRsZXJcbiAqXG4gKiBPcHRpb25zOlxuICogIC0gcGFyYW0ge1N0cmluZ30gcXMgcGFyYW1ldGVyIChgY2FsbGJhY2tgKVxuICogIC0gcHJlZml4IHtTdHJpbmd9IHFzIHBhcmFtZXRlciAoYF9fanBgKVxuICogIC0gbmFtZSB7U3RyaW5nfSBxcyBwYXJhbWV0ZXIgKGBwcmVmaXhgICsgaW5jcilcbiAqICAtIHRpbWVvdXQge051bWJlcn0gaG93IGxvbmcgYWZ0ZXIgYSB0aW1lb3V0IGVycm9yIGlzIGVtaXR0ZWQgKGA2MDAwMGApXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQHBhcmFtIHtPYmplY3R8RnVuY3Rpb259IG9wdGlvbmFsIG9wdGlvbnMgLyBjYWxsYmFja1xuICogQHBhcmFtIHtGdW5jdGlvbn0gb3B0aW9uYWwgY2FsbGJhY2tcbiAqL1xuXG5mdW5jdGlvbiBqc29ucCh1cmwsIG9wdHMsIGZuKXtcbiAgaWYgKCdmdW5jdGlvbicgPT0gdHlwZW9mIG9wdHMpIHtcbiAgICBmbiA9IG9wdHM7XG4gICAgb3B0cyA9IHt9O1xuICB9XG4gIGlmICghb3B0cykgb3B0cyA9IHt9O1xuXG4gIHZhciBwcmVmaXggPSBvcHRzLnByZWZpeCB8fCAnX19qcCc7XG5cbiAgLy8gdXNlIHRoZSBjYWxsYmFjayBuYW1lIHRoYXQgd2FzIHBhc3NlZCBpZiBvbmUgd2FzIHByb3ZpZGVkLlxuICAvLyBvdGhlcndpc2UgZ2VuZXJhdGUgYSB1bmlxdWUgbmFtZSBieSBpbmNyZW1lbnRpbmcgb3VyIGNvdW50ZXIuXG4gIHZhciBpZCA9IG9wdHMubmFtZSB8fCAocHJlZml4ICsgKGNvdW50KyspKTtcblxuICB2YXIgcGFyYW0gPSBvcHRzLnBhcmFtIHx8ICdjYWxsYmFjayc7XG4gIHZhciB0aW1lb3V0ID0gbnVsbCAhPSBvcHRzLnRpbWVvdXQgPyBvcHRzLnRpbWVvdXQgOiA2MDAwMDtcbiAgdmFyIGVuYyA9IGVuY29kZVVSSUNvbXBvbmVudDtcbiAgdmFyIHRhcmdldCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdzY3JpcHQnKVswXSB8fCBkb2N1bWVudC5oZWFkO1xuICB2YXIgc2NyaXB0O1xuICB2YXIgdGltZXI7XG5cblxuICBpZiAodGltZW91dCkge1xuICAgIHRpbWVyID0gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgY2xlYW51cCgpO1xuICAgICAgaWYgKGZuKSBmbihuZXcgRXJyb3IoJ1RpbWVvdXQnKSk7XG4gICAgfSwgdGltZW91dCk7XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhbnVwKCl7XG4gICAgaWYgKHNjcmlwdC5wYXJlbnROb2RlKSBzY3JpcHQucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChzY3JpcHQpO1xuICAgIHdpbmRvd1tpZF0gPSBub29wO1xuICAgIGlmICh0aW1lcikgY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNhbmNlbCgpe1xuICAgIGlmICh3aW5kb3dbaWRdKSB7XG4gICAgICBjbGVhbnVwKCk7XG4gICAgfVxuICB9XG5cbiAgd2luZG93W2lkXSA9IGZ1bmN0aW9uKGRhdGEpe1xuICAgIGRlYnVnKCdqc29ucCBnb3QnLCBkYXRhKTtcbiAgICBjbGVhbnVwKCk7XG4gICAgaWYgKGZuKSBmbihudWxsLCBkYXRhKTtcbiAgfTtcblxuICAvLyBhZGQgcXMgY29tcG9uZW50XG4gIHVybCArPSAofnVybC5pbmRleE9mKCc/JykgPyAnJicgOiAnPycpICsgcGFyYW0gKyAnPScgKyBlbmMoaWQpO1xuICB1cmwgPSB1cmwucmVwbGFjZSgnPyYnLCAnPycpO1xuXG4gIGRlYnVnKCdqc29ucCByZXEgXCIlc1wiJywgdXJsKTtcblxuICAvLyBjcmVhdGUgc2NyaXB0XG4gIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuICBzY3JpcHQuc3JjID0gdXJsO1xuICB0YXJnZXQucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUoc2NyaXB0LCB0YXJnZXQpO1xuXG4gIHJldHVybiBjYW5jZWw7XG59XG4iLCJcbi8qKlxuICogVGhpcyBpcyB0aGUgd2ViIGJyb3dzZXIgaW1wbGVtZW50YXRpb24gb2YgYGRlYnVnKClgLlxuICpcbiAqIEV4cG9zZSBgZGVidWcoKWAgYXMgdGhlIG1vZHVsZS5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2RlYnVnJyk7XG5leHBvcnRzLmxvZyA9IGxvZztcbmV4cG9ydHMuZm9ybWF0QXJncyA9IGZvcm1hdEFyZ3M7XG5leHBvcnRzLnNhdmUgPSBzYXZlO1xuZXhwb3J0cy5sb2FkID0gbG9hZDtcbmV4cG9ydHMudXNlQ29sb3JzID0gdXNlQ29sb3JzO1xuXG4vKipcbiAqIFVzZSBjaHJvbWUuc3RvcmFnZS5sb2NhbCBpZiB3ZSBhcmUgaW4gYW4gYXBwXG4gKi9cblxudmFyIHN0b3JhZ2U7XG5cbmlmICh0eXBlb2YgY2hyb21lICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgY2hyb21lLnN0b3JhZ2UgIT09ICd1bmRlZmluZWQnKVxuICBzdG9yYWdlID0gY2hyb21lLnN0b3JhZ2UubG9jYWw7XG5lbHNlXG4gIHN0b3JhZ2UgPSBsb2NhbHN0b3JhZ2UoKTtcblxuLyoqXG4gKiBDb2xvcnMuXG4gKi9cblxuZXhwb3J0cy5jb2xvcnMgPSBbXG4gICdsaWdodHNlYWdyZWVuJyxcbiAgJ2ZvcmVzdGdyZWVuJyxcbiAgJ2dvbGRlbnJvZCcsXG4gICdkb2RnZXJibHVlJyxcbiAgJ2RhcmtvcmNoaWQnLFxuICAnY3JpbXNvbidcbl07XG5cbi8qKlxuICogQ3VycmVudGx5IG9ubHkgV2ViS2l0LWJhc2VkIFdlYiBJbnNwZWN0b3JzLCBGaXJlZm94ID49IHYzMSxcbiAqIGFuZCB0aGUgRmlyZWJ1ZyBleHRlbnNpb24gKGFueSBGaXJlZm94IHZlcnNpb24pIGFyZSBrbm93blxuICogdG8gc3VwcG9ydCBcIiVjXCIgQ1NTIGN1c3RvbWl6YXRpb25zLlxuICpcbiAqIFRPRE86IGFkZCBhIGBsb2NhbFN0b3JhZ2VgIHZhcmlhYmxlIHRvIGV4cGxpY2l0bHkgZW5hYmxlL2Rpc2FibGUgY29sb3JzXG4gKi9cblxuZnVuY3Rpb24gdXNlQ29sb3JzKCkge1xuICAvLyBpcyB3ZWJraXQ/IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzE2NDU5NjA2LzM3Njc3M1xuICByZXR1cm4gKCdXZWJraXRBcHBlYXJhbmNlJyBpbiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUpIHx8XG4gICAgLy8gaXMgZmlyZWJ1Zz8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMzk4MTIwLzM3Njc3M1xuICAgICh3aW5kb3cuY29uc29sZSAmJiAoY29uc29sZS5maXJlYnVnIHx8IChjb25zb2xlLmV4Y2VwdGlvbiAmJiBjb25zb2xlLnRhYmxlKSkpIHx8XG4gICAgLy8gaXMgZmlyZWZveCA+PSB2MzE/XG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9Ub29scy9XZWJfQ29uc29sZSNTdHlsaW5nX21lc3NhZ2VzXG4gICAgKG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKS5tYXRjaCgvZmlyZWZveFxcLyhcXGQrKS8pICYmIHBhcnNlSW50KFJlZ0V4cC4kMSwgMTApID49IDMxKTtcbn1cblxuLyoqXG4gKiBNYXAgJWogdG8gYEpTT04uc3RyaW5naWZ5KClgLCBzaW5jZSBubyBXZWIgSW5zcGVjdG9ycyBkbyB0aGF0IGJ5IGRlZmF1bHQuXG4gKi9cblxuZXhwb3J0cy5mb3JtYXR0ZXJzLmogPSBmdW5jdGlvbih2KSB7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeSh2KTtcbn07XG5cblxuLyoqXG4gKiBDb2xvcml6ZSBsb2cgYXJndW1lbnRzIGlmIGVuYWJsZWQuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBmb3JtYXRBcmdzKCkge1xuICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgdmFyIHVzZUNvbG9ycyA9IHRoaXMudXNlQ29sb3JzO1xuXG4gIGFyZ3NbMF0gPSAodXNlQ29sb3JzID8gJyVjJyA6ICcnKVxuICAgICsgdGhpcy5uYW1lc3BhY2VcbiAgICArICh1c2VDb2xvcnMgPyAnICVjJyA6ICcgJylcbiAgICArIGFyZ3NbMF1cbiAgICArICh1c2VDb2xvcnMgPyAnJWMgJyA6ICcgJylcbiAgICArICcrJyArIGV4cG9ydHMuaHVtYW5pemUodGhpcy5kaWZmKTtcblxuICBpZiAoIXVzZUNvbG9ycykgcmV0dXJuIGFyZ3M7XG5cbiAgdmFyIGMgPSAnY29sb3I6ICcgKyB0aGlzLmNvbG9yO1xuICBhcmdzID0gW2FyZ3NbMF0sIGMsICdjb2xvcjogaW5oZXJpdCddLmNvbmNhdChBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmdzLCAxKSk7XG5cbiAgLy8gdGhlIGZpbmFsIFwiJWNcIiBpcyBzb21ld2hhdCB0cmlja3ksIGJlY2F1c2UgdGhlcmUgY291bGQgYmUgb3RoZXJcbiAgLy8gYXJndW1lbnRzIHBhc3NlZCBlaXRoZXIgYmVmb3JlIG9yIGFmdGVyIHRoZSAlYywgc28gd2UgbmVlZCB0b1xuICAvLyBmaWd1cmUgb3V0IHRoZSBjb3JyZWN0IGluZGV4IHRvIGluc2VydCB0aGUgQ1NTIGludG9cbiAgdmFyIGluZGV4ID0gMDtcbiAgdmFyIGxhc3RDID0gMDtcbiAgYXJnc1swXS5yZXBsYWNlKC8lW2EteiVdL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgaWYgKCclJScgPT09IG1hdGNoKSByZXR1cm47XG4gICAgaW5kZXgrKztcbiAgICBpZiAoJyVjJyA9PT0gbWF0Y2gpIHtcbiAgICAgIC8vIHdlIG9ubHkgYXJlIGludGVyZXN0ZWQgaW4gdGhlICpsYXN0KiAlY1xuICAgICAgLy8gKHRoZSB1c2VyIG1heSBoYXZlIHByb3ZpZGVkIHRoZWlyIG93bilcbiAgICAgIGxhc3RDID0gaW5kZXg7XG4gICAgfVxuICB9KTtcblxuICBhcmdzLnNwbGljZShsYXN0QywgMCwgYyk7XG4gIHJldHVybiBhcmdzO1xufVxuXG4vKipcbiAqIEludm9rZXMgYGNvbnNvbGUubG9nKClgIHdoZW4gYXZhaWxhYmxlLlxuICogTm8tb3Agd2hlbiBgY29uc29sZS5sb2dgIGlzIG5vdCBhIFwiZnVuY3Rpb25cIi5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGxvZygpIHtcbiAgLy8gdGhpcyBoYWNrZXJ5IGlzIHJlcXVpcmVkIGZvciBJRTgvOSwgd2hlcmVcbiAgLy8gdGhlIGBjb25zb2xlLmxvZ2AgZnVuY3Rpb24gZG9lc24ndCBoYXZlICdhcHBseSdcbiAgcmV0dXJuICdvYmplY3QnID09PSB0eXBlb2YgY29uc29sZVxuICAgICYmIGNvbnNvbGUubG9nXG4gICAgJiYgRnVuY3Rpb24ucHJvdG90eXBlLmFwcGx5LmNhbGwoY29uc29sZS5sb2csIGNvbnNvbGUsIGFyZ3VtZW50cyk7XG59XG5cbi8qKlxuICogU2F2ZSBgbmFtZXNwYWNlc2AuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNhdmUobmFtZXNwYWNlcykge1xuICB0cnkge1xuICAgIGlmIChudWxsID09IG5hbWVzcGFjZXMpIHtcbiAgICAgIHN0b3JhZ2UucmVtb3ZlSXRlbSgnZGVidWcnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RvcmFnZS5kZWJ1ZyA9IG5hbWVzcGFjZXM7XG4gICAgfVxuICB9IGNhdGNoKGUpIHt9XG59XG5cbi8qKlxuICogTG9hZCBgbmFtZXNwYWNlc2AuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfSByZXR1cm5zIHRoZSBwcmV2aW91c2x5IHBlcnNpc3RlZCBkZWJ1ZyBtb2Rlc1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbG9hZCgpIHtcbiAgdmFyIHI7XG4gIHRyeSB7XG4gICAgciA9IHN0b3JhZ2UuZGVidWc7XG4gIH0gY2F0Y2goZSkge31cbiAgcmV0dXJuIHI7XG59XG5cbi8qKlxuICogRW5hYmxlIG5hbWVzcGFjZXMgbGlzdGVkIGluIGBsb2NhbFN0b3JhZ2UuZGVidWdgIGluaXRpYWxseS5cbiAqL1xuXG5leHBvcnRzLmVuYWJsZShsb2FkKCkpO1xuXG4vKipcbiAqIExvY2Fsc3RvcmFnZSBhdHRlbXB0cyB0byByZXR1cm4gdGhlIGxvY2Fsc3RvcmFnZS5cbiAqXG4gKiBUaGlzIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIHNhZmFyaSB0aHJvd3NcbiAqIHdoZW4gYSB1c2VyIGRpc2FibGVzIGNvb2tpZXMvbG9jYWxzdG9yYWdlXG4gKiBhbmQgeW91IGF0dGVtcHQgdG8gYWNjZXNzIGl0LlxuICpcbiAqIEByZXR1cm4ge0xvY2FsU3RvcmFnZX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvY2Fsc3RvcmFnZSgpe1xuICB0cnkge1xuICAgIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlO1xuICB9IGNhdGNoIChlKSB7fVxufVxuIiwiXG4vKipcbiAqIFRoaXMgaXMgdGhlIGNvbW1vbiBsb2dpYyBmb3IgYm90aCB0aGUgTm9kZS5qcyBhbmQgd2ViIGJyb3dzZXJcbiAqIGltcGxlbWVudGF0aW9ucyBvZiBgZGVidWcoKWAuXG4gKlxuICogRXhwb3NlIGBkZWJ1ZygpYCBhcyB0aGUgbW9kdWxlLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IGRlYnVnO1xuZXhwb3J0cy5jb2VyY2UgPSBjb2VyY2U7XG5leHBvcnRzLmRpc2FibGUgPSBkaXNhYmxlO1xuZXhwb3J0cy5lbmFibGUgPSBlbmFibGU7XG5leHBvcnRzLmVuYWJsZWQgPSBlbmFibGVkO1xuZXhwb3J0cy5odW1hbml6ZSA9IHJlcXVpcmUoJ21zJyk7XG5cbi8qKlxuICogVGhlIGN1cnJlbnRseSBhY3RpdmUgZGVidWcgbW9kZSBuYW1lcywgYW5kIG5hbWVzIHRvIHNraXAuXG4gKi9cblxuZXhwb3J0cy5uYW1lcyA9IFtdO1xuZXhwb3J0cy5za2lwcyA9IFtdO1xuXG4vKipcbiAqIE1hcCBvZiBzcGVjaWFsIFwiJW5cIiBoYW5kbGluZyBmdW5jdGlvbnMsIGZvciB0aGUgZGVidWcgXCJmb3JtYXRcIiBhcmd1bWVudC5cbiAqXG4gKiBWYWxpZCBrZXkgbmFtZXMgYXJlIGEgc2luZ2xlLCBsb3dlcmNhc2VkIGxldHRlciwgaS5lLiBcIm5cIi5cbiAqL1xuXG5leHBvcnRzLmZvcm1hdHRlcnMgPSB7fTtcblxuLyoqXG4gKiBQcmV2aW91c2x5IGFzc2lnbmVkIGNvbG9yLlxuICovXG5cbnZhciBwcmV2Q29sb3IgPSAwO1xuXG4vKipcbiAqIFByZXZpb3VzIGxvZyB0aW1lc3RhbXAuXG4gKi9cblxudmFyIHByZXZUaW1lO1xuXG4vKipcbiAqIFNlbGVjdCBhIGNvbG9yLlxuICpcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNlbGVjdENvbG9yKCkge1xuICByZXR1cm4gZXhwb3J0cy5jb2xvcnNbcHJldkNvbG9yKysgJSBleHBvcnRzLmNvbG9ycy5sZW5ndGhdO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIGRlYnVnZ2VyIHdpdGggdGhlIGdpdmVuIGBuYW1lc3BhY2VgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBkZWJ1ZyhuYW1lc3BhY2UpIHtcblxuICAvLyBkZWZpbmUgdGhlIGBkaXNhYmxlZGAgdmVyc2lvblxuICBmdW5jdGlvbiBkaXNhYmxlZCgpIHtcbiAgfVxuICBkaXNhYmxlZC5lbmFibGVkID0gZmFsc2U7XG5cbiAgLy8gZGVmaW5lIHRoZSBgZW5hYmxlZGAgdmVyc2lvblxuICBmdW5jdGlvbiBlbmFibGVkKCkge1xuXG4gICAgdmFyIHNlbGYgPSBlbmFibGVkO1xuXG4gICAgLy8gc2V0IGBkaWZmYCB0aW1lc3RhbXBcbiAgICB2YXIgY3VyciA9ICtuZXcgRGF0ZSgpO1xuICAgIHZhciBtcyA9IGN1cnIgLSAocHJldlRpbWUgfHwgY3Vycik7XG4gICAgc2VsZi5kaWZmID0gbXM7XG4gICAgc2VsZi5wcmV2ID0gcHJldlRpbWU7XG4gICAgc2VsZi5jdXJyID0gY3VycjtcbiAgICBwcmV2VGltZSA9IGN1cnI7XG5cbiAgICAvLyBhZGQgdGhlIGBjb2xvcmAgaWYgbm90IHNldFxuICAgIGlmIChudWxsID09IHNlbGYudXNlQ29sb3JzKSBzZWxmLnVzZUNvbG9ycyA9IGV4cG9ydHMudXNlQ29sb3JzKCk7XG4gICAgaWYgKG51bGwgPT0gc2VsZi5jb2xvciAmJiBzZWxmLnVzZUNvbG9ycykgc2VsZi5jb2xvciA9IHNlbGVjdENvbG9yKCk7XG5cbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cbiAgICBhcmdzWzBdID0gZXhwb3J0cy5jb2VyY2UoYXJnc1swXSk7XG5cbiAgICBpZiAoJ3N0cmluZycgIT09IHR5cGVvZiBhcmdzWzBdKSB7XG4gICAgICAvLyBhbnl0aGluZyBlbHNlIGxldCdzIGluc3BlY3Qgd2l0aCAlb1xuICAgICAgYXJncyA9IFsnJW8nXS5jb25jYXQoYXJncyk7XG4gICAgfVxuXG4gICAgLy8gYXBwbHkgYW55IGBmb3JtYXR0ZXJzYCB0cmFuc2Zvcm1hdGlvbnNcbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIGFyZ3NbMF0gPSBhcmdzWzBdLnJlcGxhY2UoLyUoW2EteiVdKS9nLCBmdW5jdGlvbihtYXRjaCwgZm9ybWF0KSB7XG4gICAgICAvLyBpZiB3ZSBlbmNvdW50ZXIgYW4gZXNjYXBlZCAlIHRoZW4gZG9uJ3QgaW5jcmVhc2UgdGhlIGFycmF5IGluZGV4XG4gICAgICBpZiAobWF0Y2ggPT09ICclJScpIHJldHVybiBtYXRjaDtcbiAgICAgIGluZGV4Kys7XG4gICAgICB2YXIgZm9ybWF0dGVyID0gZXhwb3J0cy5mb3JtYXR0ZXJzW2Zvcm1hdF07XG4gICAgICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGZvcm1hdHRlcikge1xuICAgICAgICB2YXIgdmFsID0gYXJnc1tpbmRleF07XG4gICAgICAgIG1hdGNoID0gZm9ybWF0dGVyLmNhbGwoc2VsZiwgdmFsKTtcblxuICAgICAgICAvLyBub3cgd2UgbmVlZCB0byByZW1vdmUgYGFyZ3NbaW5kZXhdYCBzaW5jZSBpdCdzIGlubGluZWQgaW4gdGhlIGBmb3JtYXRgXG4gICAgICAgIGFyZ3Muc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgaW5kZXgtLTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgICB9KTtcblxuICAgIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgZXhwb3J0cy5mb3JtYXRBcmdzKSB7XG4gICAgICBhcmdzID0gZXhwb3J0cy5mb3JtYXRBcmdzLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICAgIH1cbiAgICB2YXIgbG9nRm4gPSBlbmFibGVkLmxvZyB8fCBleHBvcnRzLmxvZyB8fCBjb25zb2xlLmxvZy5iaW5kKGNvbnNvbGUpO1xuICAgIGxvZ0ZuLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICB9XG4gIGVuYWJsZWQuZW5hYmxlZCA9IHRydWU7XG5cbiAgdmFyIGZuID0gZXhwb3J0cy5lbmFibGVkKG5hbWVzcGFjZSkgPyBlbmFibGVkIDogZGlzYWJsZWQ7XG5cbiAgZm4ubmFtZXNwYWNlID0gbmFtZXNwYWNlO1xuXG4gIHJldHVybiBmbjtcbn1cblxuLyoqXG4gKiBFbmFibGVzIGEgZGVidWcgbW9kZSBieSBuYW1lc3BhY2VzLiBUaGlzIGNhbiBpbmNsdWRlIG1vZGVzXG4gKiBzZXBhcmF0ZWQgYnkgYSBjb2xvbiBhbmQgd2lsZGNhcmRzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VzXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGVuYWJsZShuYW1lc3BhY2VzKSB7XG4gIGV4cG9ydHMuc2F2ZShuYW1lc3BhY2VzKTtcblxuICB2YXIgc3BsaXQgPSAobmFtZXNwYWNlcyB8fCAnJykuc3BsaXQoL1tcXHMsXSsvKTtcbiAgdmFyIGxlbiA9IHNwbGl0Lmxlbmd0aDtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKCFzcGxpdFtpXSkgY29udGludWU7IC8vIGlnbm9yZSBlbXB0eSBzdHJpbmdzXG4gICAgbmFtZXNwYWNlcyA9IHNwbGl0W2ldLnJlcGxhY2UoL1xcKi9nLCAnLio/Jyk7XG4gICAgaWYgKG5hbWVzcGFjZXNbMF0gPT09ICctJykge1xuICAgICAgZXhwb3J0cy5za2lwcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZXNwYWNlcy5zdWJzdHIoMSkgKyAnJCcpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZXhwb3J0cy5uYW1lcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZXNwYWNlcyArICckJykpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIERpc2FibGUgZGVidWcgb3V0cHV0LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZGlzYWJsZSgpIHtcbiAgZXhwb3J0cy5lbmFibGUoJycpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZ2l2ZW4gbW9kZSBuYW1lIGlzIGVuYWJsZWQsIGZhbHNlIG90aGVyd2lzZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZW5hYmxlZChuYW1lKSB7XG4gIHZhciBpLCBsZW47XG4gIGZvciAoaSA9IDAsIGxlbiA9IGV4cG9ydHMuc2tpcHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoZXhwb3J0cy5za2lwc1tpXS50ZXN0KG5hbWUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIGZvciAoaSA9IDAsIGxlbiA9IGV4cG9ydHMubmFtZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoZXhwb3J0cy5uYW1lc1tpXS50ZXN0KG5hbWUpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIENvZXJjZSBgdmFsYC5cbiAqXG4gKiBAcGFyYW0ge01peGVkfSB2YWxcbiAqIEByZXR1cm4ge01peGVkfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gY29lcmNlKHZhbCkge1xuICBpZiAodmFsIGluc3RhbmNlb2YgRXJyb3IpIHJldHVybiB2YWwuc3RhY2sgfHwgdmFsLm1lc3NhZ2U7XG4gIHJldHVybiB2YWw7XG59XG4iLCIvKipcbiAqIEhlbHBlcnMuXG4gKi9cblxudmFyIHMgPSAxMDAwO1xudmFyIG0gPSBzICogNjA7XG52YXIgaCA9IG0gKiA2MDtcbnZhciBkID0gaCAqIDI0O1xudmFyIHkgPSBkICogMzY1LjI1O1xuXG4vKipcbiAqIFBhcnNlIG9yIGZvcm1hdCB0aGUgZ2l2ZW4gYHZhbGAuXG4gKlxuICogT3B0aW9uczpcbiAqXG4gKiAgLSBgbG9uZ2AgdmVyYm9zZSBmb3JtYXR0aW5nIFtmYWxzZV1cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ9IHZhbFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge1N0cmluZ3xOdW1iZXJ9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odmFsLCBvcHRpb25zKXtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgdmFsKSByZXR1cm4gcGFyc2UodmFsKTtcbiAgcmV0dXJuIG9wdGlvbnMubG9uZ1xuICAgID8gbG9uZyh2YWwpXG4gICAgOiBzaG9ydCh2YWwpO1xufTtcblxuLyoqXG4gKiBQYXJzZSB0aGUgZ2l2ZW4gYHN0cmAgYW5kIHJldHVybiBtaWxsaXNlY29uZHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFyc2Uoc3RyKSB7XG4gIHZhciBtYXRjaCA9IC9eKCg/OlxcZCspP1xcLj9cXGQrKSAqKG1pbGxpc2Vjb25kcz98bXNlY3M/fG1zfHNlY29uZHM/fHNlY3M/fHN8bWludXRlcz98bWlucz98bXxob3Vycz98aHJzP3xofGRheXM/fGR8eWVhcnM/fHlycz98eSk/JC9pLmV4ZWMoc3RyKTtcbiAgaWYgKCFtYXRjaCkgcmV0dXJuO1xuICB2YXIgbiA9IHBhcnNlRmxvYXQobWF0Y2hbMV0pO1xuICB2YXIgdHlwZSA9IChtYXRjaFsyXSB8fCAnbXMnKS50b0xvd2VyQ2FzZSgpO1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICd5ZWFycyc6XG4gICAgY2FzZSAneWVhcic6XG4gICAgY2FzZSAneXJzJzpcbiAgICBjYXNlICd5cic6XG4gICAgY2FzZSAneSc6XG4gICAgICByZXR1cm4gbiAqIHk7XG4gICAgY2FzZSAnZGF5cyc6XG4gICAgY2FzZSAnZGF5JzpcbiAgICBjYXNlICdkJzpcbiAgICAgIHJldHVybiBuICogZDtcbiAgICBjYXNlICdob3Vycyc6XG4gICAgY2FzZSAnaG91cic6XG4gICAgY2FzZSAnaHJzJzpcbiAgICBjYXNlICdocic6XG4gICAgY2FzZSAnaCc6XG4gICAgICByZXR1cm4gbiAqIGg7XG4gICAgY2FzZSAnbWludXRlcyc6XG4gICAgY2FzZSAnbWludXRlJzpcbiAgICBjYXNlICdtaW5zJzpcbiAgICBjYXNlICdtaW4nOlxuICAgIGNhc2UgJ20nOlxuICAgICAgcmV0dXJuIG4gKiBtO1xuICAgIGNhc2UgJ3NlY29uZHMnOlxuICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgY2FzZSAnc2Vjcyc6XG4gICAgY2FzZSAnc2VjJzpcbiAgICBjYXNlICdzJzpcbiAgICAgIHJldHVybiBuICogcztcbiAgICBjYXNlICdtaWxsaXNlY29uZHMnOlxuICAgIGNhc2UgJ21pbGxpc2Vjb25kJzpcbiAgICBjYXNlICdtc2Vjcyc6XG4gICAgY2FzZSAnbXNlYyc6XG4gICAgY2FzZSAnbXMnOlxuICAgICAgcmV0dXJuIG47XG4gIH1cbn1cblxuLyoqXG4gKiBTaG9ydCBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzaG9ydChtcykge1xuICBpZiAobXMgPj0gZCkgcmV0dXJuIE1hdGgucm91bmQobXMgLyBkKSArICdkJztcbiAgaWYgKG1zID49IGgpIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gaCkgKyAnaCc7XG4gIGlmIChtcyA+PSBtKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIG0pICsgJ20nO1xuICBpZiAobXMgPj0gcykgcmV0dXJuIE1hdGgucm91bmQobXMgLyBzKSArICdzJztcbiAgcmV0dXJuIG1zICsgJ21zJztcbn1cblxuLyoqXG4gKiBMb25nIGZvcm1hdCBmb3IgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvbmcobXMpIHtcbiAgcmV0dXJuIHBsdXJhbChtcywgZCwgJ2RheScpXG4gICAgfHwgcGx1cmFsKG1zLCBoLCAnaG91cicpXG4gICAgfHwgcGx1cmFsKG1zLCBtLCAnbWludXRlJylcbiAgICB8fCBwbHVyYWwobXMsIHMsICdzZWNvbmQnKVxuICAgIHx8IG1zICsgJyBtcyc7XG59XG5cbi8qKlxuICogUGx1cmFsaXphdGlvbiBoZWxwZXIuXG4gKi9cblxuZnVuY3Rpb24gcGx1cmFsKG1zLCBuLCBuYW1lKSB7XG4gIGlmIChtcyA8IG4pIHJldHVybjtcbiAgaWYgKG1zIDwgbiAqIDEuNSkgcmV0dXJuIE1hdGguZmxvb3IobXMgLyBuKSArICcgJyArIG5hbWU7XG4gIHJldHVybiBNYXRoLmNlaWwobXMgLyBuKSArICcgJyArIG5hbWUgKyAncyc7XG59XG4iLCJmdW5jdGlvbiBjb3JzbGl0ZSh1cmwsIGNhbGxiYWNrLCBjb3JzKSB7XG4gICAgdmFyIHNlbnQgPSBmYWxzZTtcblxuICAgIGlmICh0eXBlb2Ygd2luZG93LlhNTEh0dHBSZXF1ZXN0ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soRXJyb3IoJ0Jyb3dzZXIgbm90IHN1cHBvcnRlZCcpKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGNvcnMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHZhciBtID0gdXJsLm1hdGNoKC9eXFxzKmh0dHBzPzpcXC9cXC9bXlxcL10qLyk7XG4gICAgICAgIGNvcnMgPSBtICYmIChtWzBdICE9PSBsb2NhdGlvbi5wcm90b2NvbCArICcvLycgKyBsb2NhdGlvbi5kb21haW4gK1xuICAgICAgICAgICAgICAgIChsb2NhdGlvbi5wb3J0ID8gJzonICsgbG9jYXRpb24ucG9ydCA6ICcnKSk7XG4gICAgfVxuXG4gICAgdmFyIHggPSBuZXcgd2luZG93LlhNTEh0dHBSZXF1ZXN0KCk7XG5cbiAgICBmdW5jdGlvbiBpc1N1Y2Nlc3NmdWwoc3RhdHVzKSB7XG4gICAgICAgIHJldHVybiBzdGF0dXMgPj0gMjAwICYmIHN0YXR1cyA8IDMwMCB8fCBzdGF0dXMgPT09IDMwNDtcbiAgICB9XG5cbiAgICBpZiAoY29ycyAmJiAhKCd3aXRoQ3JlZGVudGlhbHMnIGluIHgpKSB7XG4gICAgICAgIC8vIElFOC05XG4gICAgICAgIHggPSBuZXcgd2luZG93LlhEb21haW5SZXF1ZXN0KCk7XG5cbiAgICAgICAgLy8gRW5zdXJlIGNhbGxiYWNrIGlzIG5ldmVyIGNhbGxlZCBzeW5jaHJvbm91c2x5LCBpLmUuLCBiZWZvcmVcbiAgICAgICAgLy8geC5zZW5kKCkgcmV0dXJucyAodGhpcyBoYXMgYmVlbiBvYnNlcnZlZCBpbiB0aGUgd2lsZCkuXG4gICAgICAgIC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWFwYm94L21hcGJveC5qcy9pc3N1ZXMvNDcyXG4gICAgICAgIHZhciBvcmlnaW5hbCA9IGNhbGxiYWNrO1xuICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHNlbnQpIHtcbiAgICAgICAgICAgICAgICBvcmlnaW5hbC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXMsIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgb3JpZ2luYWwuYXBwbHkodGhhdCwgYXJncyk7XG4gICAgICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsb2FkZWQoKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIC8vIFhEb21haW5SZXF1ZXN0XG4gICAgICAgICAgICB4LnN0YXR1cyA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICAvLyBtb2Rlcm4gYnJvd3NlcnNcbiAgICAgICAgICAgIGlzU3VjY2Vzc2Z1bCh4LnN0YXR1cykpIGNhbGxiYWNrLmNhbGwoeCwgbnVsbCwgeCk7XG4gICAgICAgIGVsc2UgY2FsbGJhY2suY2FsbCh4LCB4LCBudWxsKTtcbiAgICB9XG5cbiAgICAvLyBCb3RoIGBvbnJlYWR5c3RhdGVjaGFuZ2VgIGFuZCBgb25sb2FkYCBjYW4gZmlyZS4gYG9ucmVhZHlzdGF0ZWNoYW5nZWBcbiAgICAvLyBoYXMgW2JlZW4gc3VwcG9ydGVkIGZvciBsb25nZXJdKGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzkxODE1MDgvMjI5MDAxKS5cbiAgICBpZiAoJ29ubG9hZCcgaW4geCkge1xuICAgICAgICB4Lm9ubG9hZCA9IGxvYWRlZDtcbiAgICB9IGVsc2Uge1xuICAgICAgICB4Lm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uIHJlYWR5c3RhdGUoKSB7XG4gICAgICAgICAgICBpZiAoeC5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgICAgICAgICAgbG9hZGVkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gQ2FsbCB0aGUgY2FsbGJhY2sgd2l0aCB0aGUgWE1MSHR0cFJlcXVlc3Qgb2JqZWN0IGFzIGFuIGVycm9yIGFuZCBwcmV2ZW50XG4gICAgLy8gaXQgZnJvbSBldmVyIGJlaW5nIGNhbGxlZCBhZ2FpbiBieSByZWFzc2lnbmluZyBpdCB0byBgbm9vcGBcbiAgICB4Lm9uZXJyb3IgPSBmdW5jdGlvbiBlcnJvcihldnQpIHtcbiAgICAgICAgLy8gWERvbWFpblJlcXVlc3QgcHJvdmlkZXMgbm8gZXZ0IHBhcmFtZXRlclxuICAgICAgICBjYWxsYmFjay5jYWxsKHRoaXMsIGV2dCB8fCB0cnVlLCBudWxsKTtcbiAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbigpIHsgfTtcbiAgICB9O1xuXG4gICAgLy8gSUU5IG11c3QgaGF2ZSBvbnByb2dyZXNzIGJlIHNldCB0byBhIHVuaXF1ZSBmdW5jdGlvbi5cbiAgICB4Lm9ucHJvZ3Jlc3MgPSBmdW5jdGlvbigpIHsgfTtcblxuICAgIHgub250aW1lb3V0ID0gZnVuY3Rpb24oZXZ0KSB7XG4gICAgICAgIGNhbGxiYWNrLmNhbGwodGhpcywgZXZ0LCBudWxsKTtcbiAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbigpIHsgfTtcbiAgICB9O1xuXG4gICAgeC5vbmFib3J0ID0gZnVuY3Rpb24oZXZ0KSB7XG4gICAgICAgIGNhbGxiYWNrLmNhbGwodGhpcywgZXZ0LCBudWxsKTtcbiAgICAgICAgY2FsbGJhY2sgPSBmdW5jdGlvbigpIHsgfTtcbiAgICB9O1xuXG4gICAgLy8gR0VUIGlzIHRoZSBvbmx5IHN1cHBvcnRlZCBIVFRQIFZlcmIgYnkgWERvbWFpblJlcXVlc3QgYW5kIGlzIHRoZVxuICAgIC8vIG9ubHkgb25lIHN1cHBvcnRlZCBoZXJlLlxuICAgIHgub3BlbignR0VUJywgdXJsLCB0cnVlKTtcblxuICAgIC8vIFNlbmQgdGhlIHJlcXVlc3QuIFNlbmRpbmcgZGF0YSBpcyBub3Qgc3VwcG9ydGVkLlxuICAgIHguc2VuZChudWxsKTtcbiAgICBzZW50ID0gdHJ1ZTtcblxuICAgIHJldHVybiB4O1xufVxuXG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcpIG1vZHVsZS5leHBvcnRzID0gY29yc2xpdGU7XG4iLCIvKlxuIExlYWZsZXQsIGEgSmF2YVNjcmlwdCBsaWJyYXJ5IGZvciBtb2JpbGUtZnJpZW5kbHkgaW50ZXJhY3RpdmUgbWFwcy4gaHR0cDovL2xlYWZsZXRqcy5jb21cbiAoYykgMjAxMC0yMDEzLCBWbGFkaW1pciBBZ2Fmb25raW5cbiAoYykgMjAxMC0yMDExLCBDbG91ZE1hZGVcbiovXG4oZnVuY3Rpb24gKHdpbmRvdywgZG9jdW1lbnQsIHVuZGVmaW5lZCkge1xyXG52YXIgb2xkTCA9IHdpbmRvdy5MLFxyXG4gICAgTCA9IHt9O1xyXG5cclxuTC52ZXJzaW9uID0gJzAuNy4yJztcclxuXHJcbi8vIGRlZmluZSBMZWFmbGV0IGZvciBOb2RlIG1vZHVsZSBwYXR0ZXJuIGxvYWRlcnMsIGluY2x1ZGluZyBCcm93c2VyaWZ5XHJcbmlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgbW9kdWxlLmV4cG9ydHMgPT09ICdvYmplY3QnKSB7XHJcblx0bW9kdWxlLmV4cG9ydHMgPSBMO1xyXG5cclxuLy8gZGVmaW5lIExlYWZsZXQgYXMgYW4gQU1EIG1vZHVsZVxyXG59IGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xyXG5cdGRlZmluZShMKTtcclxufVxyXG5cclxuLy8gZGVmaW5lIExlYWZsZXQgYXMgYSBnbG9iYWwgTCB2YXJpYWJsZSwgc2F2aW5nIHRoZSBvcmlnaW5hbCBMIHRvIHJlc3RvcmUgbGF0ZXIgaWYgbmVlZGVkXHJcblxyXG5MLm5vQ29uZmxpY3QgPSBmdW5jdGlvbiAoKSB7XHJcblx0d2luZG93LkwgPSBvbGRMO1xyXG5cdHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxud2luZG93LkwgPSBMO1xyXG5cblxuLypcclxuICogTC5VdGlsIGNvbnRhaW5zIHZhcmlvdXMgdXRpbGl0eSBmdW5jdGlvbnMgdXNlZCB0aHJvdWdob3V0IExlYWZsZXQgY29kZS5cclxuICovXHJcblxyXG5MLlV0aWwgPSB7XHJcblx0ZXh0ZW5kOiBmdW5jdGlvbiAoZGVzdCkgeyAvLyAoT2JqZWN0WywgT2JqZWN0LCAuLi5dKSAtPlxyXG5cdFx0dmFyIHNvdXJjZXMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpLFxyXG5cdFx0ICAgIGksIGosIGxlbiwgc3JjO1xyXG5cclxuXHRcdGZvciAoaiA9IDAsIGxlbiA9IHNvdXJjZXMubGVuZ3RoOyBqIDwgbGVuOyBqKyspIHtcclxuXHRcdFx0c3JjID0gc291cmNlc1tqXSB8fCB7fTtcclxuXHRcdFx0Zm9yIChpIGluIHNyYykge1xyXG5cdFx0XHRcdGlmIChzcmMuaGFzT3duUHJvcGVydHkoaSkpIHtcclxuXHRcdFx0XHRcdGRlc3RbaV0gPSBzcmNbaV07XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gZGVzdDtcclxuXHR9LFxyXG5cclxuXHRiaW5kOiBmdW5jdGlvbiAoZm4sIG9iaikgeyAvLyAoRnVuY3Rpb24sIE9iamVjdCkgLT4gRnVuY3Rpb25cclxuXHRcdHZhciBhcmdzID0gYXJndW1lbnRzLmxlbmd0aCA+IDIgPyBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpIDogbnVsbDtcclxuXHRcdHJldHVybiBmdW5jdGlvbiAoKSB7XHJcblx0XHRcdHJldHVybiBmbi5hcHBseShvYmosIGFyZ3MgfHwgYXJndW1lbnRzKTtcclxuXHRcdH07XHJcblx0fSxcclxuXHJcblx0c3RhbXA6IChmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgbGFzdElkID0gMCxcclxuXHRcdCAgICBrZXkgPSAnX2xlYWZsZXRfaWQnO1xyXG5cdFx0cmV0dXJuIGZ1bmN0aW9uIChvYmopIHtcclxuXHRcdFx0b2JqW2tleV0gPSBvYmpba2V5XSB8fCArK2xhc3RJZDtcclxuXHRcdFx0cmV0dXJuIG9ialtrZXldO1xyXG5cdFx0fTtcclxuXHR9KCkpLFxyXG5cclxuXHRpbnZva2VFYWNoOiBmdW5jdGlvbiAob2JqLCBtZXRob2QsIGNvbnRleHQpIHtcclxuXHRcdHZhciBpLCBhcmdzO1xyXG5cclxuXHRcdGlmICh0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xyXG5cdFx0XHRhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAzKTtcclxuXHJcblx0XHRcdGZvciAoaSBpbiBvYmopIHtcclxuXHRcdFx0XHRtZXRob2QuYXBwbHkoY29udGV4dCwgW2ksIG9ialtpXV0uY29uY2F0KGFyZ3MpKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gZmFsc2U7XHJcblx0fSxcclxuXHJcblx0bGltaXRFeGVjQnlJbnRlcnZhbDogZnVuY3Rpb24gKGZuLCB0aW1lLCBjb250ZXh0KSB7XHJcblx0XHR2YXIgbG9jaywgZXhlY09uVW5sb2NrO1xyXG5cclxuXHRcdHJldHVybiBmdW5jdGlvbiB3cmFwcGVyRm4oKSB7XHJcblx0XHRcdHZhciBhcmdzID0gYXJndW1lbnRzO1xyXG5cclxuXHRcdFx0aWYgKGxvY2spIHtcclxuXHRcdFx0XHRleGVjT25VbmxvY2sgPSB0cnVlO1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0bG9jayA9IHRydWU7XHJcblxyXG5cdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcclxuXHRcdFx0XHRsb2NrID0gZmFsc2U7XHJcblxyXG5cdFx0XHRcdGlmIChleGVjT25VbmxvY2spIHtcclxuXHRcdFx0XHRcdHdyYXBwZXJGbi5hcHBseShjb250ZXh0LCBhcmdzKTtcclxuXHRcdFx0XHRcdGV4ZWNPblVubG9jayA9IGZhbHNlO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSwgdGltZSk7XHJcblxyXG5cdFx0XHRmbi5hcHBseShjb250ZXh0LCBhcmdzKTtcclxuXHRcdH07XHJcblx0fSxcclxuXHJcblx0ZmFsc2VGbjogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIGZhbHNlO1xyXG5cdH0sXHJcblxyXG5cdGZvcm1hdE51bTogZnVuY3Rpb24gKG51bSwgZGlnaXRzKSB7XHJcblx0XHR2YXIgcG93ID0gTWF0aC5wb3coMTAsIGRpZ2l0cyB8fCA1KTtcclxuXHRcdHJldHVybiBNYXRoLnJvdW5kKG51bSAqIHBvdykgLyBwb3c7XHJcblx0fSxcclxuXHJcblx0dHJpbTogZnVuY3Rpb24gKHN0cikge1xyXG5cdFx0cmV0dXJuIHN0ci50cmltID8gc3RyLnRyaW0oKSA6IHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJyk7XHJcblx0fSxcclxuXHJcblx0c3BsaXRXb3JkczogZnVuY3Rpb24gKHN0cikge1xyXG5cdFx0cmV0dXJuIEwuVXRpbC50cmltKHN0cikuc3BsaXQoL1xccysvKTtcclxuXHR9LFxyXG5cclxuXHRzZXRPcHRpb25zOiBmdW5jdGlvbiAob2JqLCBvcHRpb25zKSB7XHJcblx0XHRvYmoub3B0aW9ucyA9IEwuZXh0ZW5kKHt9LCBvYmoub3B0aW9ucywgb3B0aW9ucyk7XHJcblx0XHRyZXR1cm4gb2JqLm9wdGlvbnM7XHJcblx0fSxcclxuXHJcblx0Z2V0UGFyYW1TdHJpbmc6IGZ1bmN0aW9uIChvYmosIGV4aXN0aW5nVXJsLCB1cHBlcmNhc2UpIHtcclxuXHRcdHZhciBwYXJhbXMgPSBbXTtcclxuXHRcdGZvciAodmFyIGkgaW4gb2JqKSB7XHJcblx0XHRcdHBhcmFtcy5wdXNoKGVuY29kZVVSSUNvbXBvbmVudCh1cHBlcmNhc2UgPyBpLnRvVXBwZXJDYXNlKCkgOiBpKSArICc9JyArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbaV0pKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiAoKCFleGlzdGluZ1VybCB8fCBleGlzdGluZ1VybC5pbmRleE9mKCc/JykgPT09IC0xKSA/ICc/JyA6ICcmJykgKyBwYXJhbXMuam9pbignJicpO1xyXG5cdH0sXHJcblx0dGVtcGxhdGU6IGZ1bmN0aW9uIChzdHIsIGRhdGEpIHtcclxuXHRcdHJldHVybiBzdHIucmVwbGFjZSgvXFx7ICooW1xcd19dKykgKlxcfS9nLCBmdW5jdGlvbiAoc3RyLCBrZXkpIHtcclxuXHRcdFx0dmFyIHZhbHVlID0gZGF0YVtrZXldO1xyXG5cdFx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gdmFsdWUgcHJvdmlkZWQgZm9yIHZhcmlhYmxlICcgKyBzdHIpO1xyXG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG5cdFx0XHRcdHZhbHVlID0gdmFsdWUoZGF0YSk7XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIHZhbHVlO1xyXG5cdFx0fSk7XHJcblx0fSxcclxuXHJcblx0aXNBcnJheTogQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAob2JqKSB7XHJcblx0XHRyZXR1cm4gKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCBBcnJheV0nKTtcclxuXHR9LFxyXG5cclxuXHRlbXB0eUltYWdlVXJsOiAnZGF0YTppbWFnZS9naWY7YmFzZTY0LFIwbEdPRGxoQVFBQkFBRC9BQ3dBQUFBQUFRQUJBQUFDQURzPSdcclxufTtcclxuXHJcbihmdW5jdGlvbiAoKSB7XHJcblxyXG5cdC8vIGluc3BpcmVkIGJ5IGh0dHA6Ly9wYXVsaXJpc2guY29tLzIwMTEvcmVxdWVzdGFuaW1hdGlvbmZyYW1lLWZvci1zbWFydC1hbmltYXRpbmcvXHJcblxyXG5cdGZ1bmN0aW9uIGdldFByZWZpeGVkKG5hbWUpIHtcclxuXHRcdHZhciBpLCBmbixcclxuXHRcdCAgICBwcmVmaXhlcyA9IFsnd2Via2l0JywgJ21veicsICdvJywgJ21zJ107XHJcblxyXG5cdFx0Zm9yIChpID0gMDsgaSA8IHByZWZpeGVzLmxlbmd0aCAmJiAhZm47IGkrKykge1xyXG5cdFx0XHRmbiA9IHdpbmRvd1twcmVmaXhlc1tpXSArIG5hbWVdO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBmbjtcclxuXHR9XHJcblxyXG5cdHZhciBsYXN0VGltZSA9IDA7XHJcblxyXG5cdGZ1bmN0aW9uIHRpbWVvdXREZWZlcihmbikge1xyXG5cdFx0dmFyIHRpbWUgPSArbmV3IERhdGUoKSxcclxuXHRcdCAgICB0aW1lVG9DYWxsID0gTWF0aC5tYXgoMCwgMTYgLSAodGltZSAtIGxhc3RUaW1lKSk7XHJcblxyXG5cdFx0bGFzdFRpbWUgPSB0aW1lICsgdGltZVRvQ2FsbDtcclxuXHRcdHJldHVybiB3aW5kb3cuc2V0VGltZW91dChmbiwgdGltZVRvQ2FsbCk7XHJcblx0fVxyXG5cclxuXHR2YXIgcmVxdWVzdEZuID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxyXG5cdCAgICAgICAgZ2V0UHJlZml4ZWQoJ1JlcXVlc3RBbmltYXRpb25GcmFtZScpIHx8IHRpbWVvdXREZWZlcjtcclxuXHJcblx0dmFyIGNhbmNlbEZuID0gd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lIHx8XHJcblx0ICAgICAgICBnZXRQcmVmaXhlZCgnQ2FuY2VsQW5pbWF0aW9uRnJhbWUnKSB8fFxyXG5cdCAgICAgICAgZ2V0UHJlZml4ZWQoJ0NhbmNlbFJlcXVlc3RBbmltYXRpb25GcmFtZScpIHx8XHJcblx0ICAgICAgICBmdW5jdGlvbiAoaWQpIHsgd2luZG93LmNsZWFyVGltZW91dChpZCk7IH07XHJcblxyXG5cclxuXHRMLlV0aWwucmVxdWVzdEFuaW1GcmFtZSA9IGZ1bmN0aW9uIChmbiwgY29udGV4dCwgaW1tZWRpYXRlLCBlbGVtZW50KSB7XHJcblx0XHRmbiA9IEwuYmluZChmbiwgY29udGV4dCk7XHJcblxyXG5cdFx0aWYgKGltbWVkaWF0ZSAmJiByZXF1ZXN0Rm4gPT09IHRpbWVvdXREZWZlcikge1xyXG5cdFx0XHRmbigpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0cmV0dXJuIHJlcXVlc3RGbi5jYWxsKHdpbmRvdywgZm4sIGVsZW1lbnQpO1xyXG5cdFx0fVxyXG5cdH07XHJcblxyXG5cdEwuVXRpbC5jYW5jZWxBbmltRnJhbWUgPSBmdW5jdGlvbiAoaWQpIHtcclxuXHRcdGlmIChpZCkge1xyXG5cdFx0XHRjYW5jZWxGbi5jYWxsKHdpbmRvdywgaWQpO1xyXG5cdFx0fVxyXG5cdH07XHJcblxyXG59KCkpO1xyXG5cclxuLy8gc2hvcnRjdXRzIGZvciBtb3N0IHVzZWQgdXRpbGl0eSBmdW5jdGlvbnNcclxuTC5leHRlbmQgPSBMLlV0aWwuZXh0ZW5kO1xyXG5MLmJpbmQgPSBMLlV0aWwuYmluZDtcclxuTC5zdGFtcCA9IEwuVXRpbC5zdGFtcDtcclxuTC5zZXRPcHRpb25zID0gTC5VdGlsLnNldE9wdGlvbnM7XHJcblxuXG4vKlxyXG4gKiBMLkNsYXNzIHBvd2VycyB0aGUgT09QIGZhY2lsaXRpZXMgb2YgdGhlIGxpYnJhcnkuXHJcbiAqIFRoYW5rcyB0byBKb2huIFJlc2lnIGFuZCBEZWFuIEVkd2FyZHMgZm9yIGluc3BpcmF0aW9uIVxyXG4gKi9cclxuXHJcbkwuQ2xhc3MgPSBmdW5jdGlvbiAoKSB7fTtcclxuXHJcbkwuQ2xhc3MuZXh0ZW5kID0gZnVuY3Rpb24gKHByb3BzKSB7XHJcblxyXG5cdC8vIGV4dGVuZGVkIGNsYXNzIHdpdGggdGhlIG5ldyBwcm90b3R5cGVcclxuXHR2YXIgTmV3Q2xhc3MgPSBmdW5jdGlvbiAoKSB7XHJcblxyXG5cdFx0Ly8gY2FsbCB0aGUgY29uc3RydWN0b3JcclxuXHRcdGlmICh0aGlzLmluaXRpYWxpemUpIHtcclxuXHRcdFx0dGhpcy5pbml0aWFsaXplLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gY2FsbCBhbGwgY29uc3RydWN0b3IgaG9va3NcclxuXHRcdGlmICh0aGlzLl9pbml0SG9va3MpIHtcclxuXHRcdFx0dGhpcy5jYWxsSW5pdEhvb2tzKCk7XHJcblx0XHR9XHJcblx0fTtcclxuXHJcblx0Ly8gaW5zdGFudGlhdGUgY2xhc3Mgd2l0aG91dCBjYWxsaW5nIGNvbnN0cnVjdG9yXHJcblx0dmFyIEYgPSBmdW5jdGlvbiAoKSB7fTtcclxuXHRGLnByb3RvdHlwZSA9IHRoaXMucHJvdG90eXBlO1xyXG5cclxuXHR2YXIgcHJvdG8gPSBuZXcgRigpO1xyXG5cdHByb3RvLmNvbnN0cnVjdG9yID0gTmV3Q2xhc3M7XHJcblxyXG5cdE5ld0NsYXNzLnByb3RvdHlwZSA9IHByb3RvO1xyXG5cclxuXHQvL2luaGVyaXQgcGFyZW50J3Mgc3RhdGljc1xyXG5cdGZvciAodmFyIGkgaW4gdGhpcykge1xyXG5cdFx0aWYgKHRoaXMuaGFzT3duUHJvcGVydHkoaSkgJiYgaSAhPT0gJ3Byb3RvdHlwZScpIHtcclxuXHRcdFx0TmV3Q2xhc3NbaV0gPSB0aGlzW2ldO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0Ly8gbWl4IHN0YXRpYyBwcm9wZXJ0aWVzIGludG8gdGhlIGNsYXNzXHJcblx0aWYgKHByb3BzLnN0YXRpY3MpIHtcclxuXHRcdEwuZXh0ZW5kKE5ld0NsYXNzLCBwcm9wcy5zdGF0aWNzKTtcclxuXHRcdGRlbGV0ZSBwcm9wcy5zdGF0aWNzO1xyXG5cdH1cclxuXHJcblx0Ly8gbWl4IGluY2x1ZGVzIGludG8gdGhlIHByb3RvdHlwZVxyXG5cdGlmIChwcm9wcy5pbmNsdWRlcykge1xyXG5cdFx0TC5VdGlsLmV4dGVuZC5hcHBseShudWxsLCBbcHJvdG9dLmNvbmNhdChwcm9wcy5pbmNsdWRlcykpO1xyXG5cdFx0ZGVsZXRlIHByb3BzLmluY2x1ZGVzO1xyXG5cdH1cclxuXHJcblx0Ly8gbWVyZ2Ugb3B0aW9uc1xyXG5cdGlmIChwcm9wcy5vcHRpb25zICYmIHByb3RvLm9wdGlvbnMpIHtcclxuXHRcdHByb3BzLm9wdGlvbnMgPSBMLmV4dGVuZCh7fSwgcHJvdG8ub3B0aW9ucywgcHJvcHMub3B0aW9ucyk7XHJcblx0fVxyXG5cclxuXHQvLyBtaXggZ2l2ZW4gcHJvcGVydGllcyBpbnRvIHRoZSBwcm90b3R5cGVcclxuXHRMLmV4dGVuZChwcm90bywgcHJvcHMpO1xyXG5cclxuXHRwcm90by5faW5pdEhvb2tzID0gW107XHJcblxyXG5cdHZhciBwYXJlbnQgPSB0aGlzO1xyXG5cdC8vIGpzaGludCBjYW1lbGNhc2U6IGZhbHNlXHJcblx0TmV3Q2xhc3MuX19zdXBlcl9fID0gcGFyZW50LnByb3RvdHlwZTtcclxuXHJcblx0Ly8gYWRkIG1ldGhvZCBmb3IgY2FsbGluZyBhbGwgaG9va3NcclxuXHRwcm90by5jYWxsSW5pdEhvb2tzID0gZnVuY3Rpb24gKCkge1xyXG5cclxuXHRcdGlmICh0aGlzLl9pbml0SG9va3NDYWxsZWQpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0aWYgKHBhcmVudC5wcm90b3R5cGUuY2FsbEluaXRIb29rcykge1xyXG5cdFx0XHRwYXJlbnQucHJvdG90eXBlLmNhbGxJbml0SG9va3MuY2FsbCh0aGlzKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9pbml0SG9va3NDYWxsZWQgPSB0cnVlO1xyXG5cclxuXHRcdGZvciAodmFyIGkgPSAwLCBsZW4gPSBwcm90by5faW5pdEhvb2tzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdHByb3RvLl9pbml0SG9va3NbaV0uY2FsbCh0aGlzKTtcclxuXHRcdH1cclxuXHR9O1xyXG5cclxuXHRyZXR1cm4gTmV3Q2xhc3M7XHJcbn07XHJcblxyXG5cclxuLy8gbWV0aG9kIGZvciBhZGRpbmcgcHJvcGVydGllcyB0byBwcm90b3R5cGVcclxuTC5DbGFzcy5pbmNsdWRlID0gZnVuY3Rpb24gKHByb3BzKSB7XHJcblx0TC5leHRlbmQodGhpcy5wcm90b3R5cGUsIHByb3BzKTtcclxufTtcclxuXHJcbi8vIG1lcmdlIG5ldyBkZWZhdWx0IG9wdGlvbnMgdG8gdGhlIENsYXNzXHJcbkwuQ2xhc3MubWVyZ2VPcHRpb25zID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcclxuXHRMLmV4dGVuZCh0aGlzLnByb3RvdHlwZS5vcHRpb25zLCBvcHRpb25zKTtcclxufTtcclxuXHJcbi8vIGFkZCBhIGNvbnN0cnVjdG9yIGhvb2tcclxuTC5DbGFzcy5hZGRJbml0SG9vayA9IGZ1bmN0aW9uIChmbikgeyAvLyAoRnVuY3Rpb24pIHx8IChTdHJpbmcsIGFyZ3MuLi4pXHJcblx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xyXG5cclxuXHR2YXIgaW5pdCA9IHR5cGVvZiBmbiA9PT0gJ2Z1bmN0aW9uJyA/IGZuIDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpc1tmbl0uYXBwbHkodGhpcywgYXJncyk7XHJcblx0fTtcclxuXHJcblx0dGhpcy5wcm90b3R5cGUuX2luaXRIb29rcyA9IHRoaXMucHJvdG90eXBlLl9pbml0SG9va3MgfHwgW107XHJcblx0dGhpcy5wcm90b3R5cGUuX2luaXRIb29rcy5wdXNoKGluaXQpO1xyXG59O1xyXG5cblxuLypcclxuICogTC5NaXhpbi5FdmVudHMgaXMgdXNlZCB0byBhZGQgY3VzdG9tIGV2ZW50cyBmdW5jdGlvbmFsaXR5IHRvIExlYWZsZXQgY2xhc3Nlcy5cclxuICovXHJcblxyXG52YXIgZXZlbnRzS2V5ID0gJ19sZWFmbGV0X2V2ZW50cyc7XHJcblxyXG5MLk1peGluID0ge307XHJcblxyXG5MLk1peGluLkV2ZW50cyA9IHtcclxuXHJcblx0YWRkRXZlbnRMaXN0ZW5lcjogZnVuY3Rpb24gKHR5cGVzLCBmbiwgY29udGV4dCkgeyAvLyAoU3RyaW5nLCBGdW5jdGlvblssIE9iamVjdF0pIG9yIChPYmplY3RbLCBPYmplY3RdKVxyXG5cclxuXHRcdC8vIHR5cGVzIGNhbiBiZSBhIG1hcCBvZiB0eXBlcy9oYW5kbGVyc1xyXG5cdFx0aWYgKEwuVXRpbC5pbnZva2VFYWNoKHR5cGVzLCB0aGlzLmFkZEV2ZW50TGlzdGVuZXIsIHRoaXMsIGZuLCBjb250ZXh0KSkgeyByZXR1cm4gdGhpczsgfVxyXG5cclxuXHRcdHZhciBldmVudHMgPSB0aGlzW2V2ZW50c0tleV0gPSB0aGlzW2V2ZW50c0tleV0gfHwge30sXHJcblx0XHQgICAgY29udGV4dElkID0gY29udGV4dCAmJiBjb250ZXh0ICE9PSB0aGlzICYmIEwuc3RhbXAoY29udGV4dCksXHJcblx0XHQgICAgaSwgbGVuLCBldmVudCwgdHlwZSwgaW5kZXhLZXksIGluZGV4TGVuS2V5LCB0eXBlSW5kZXg7XHJcblxyXG5cdFx0Ly8gdHlwZXMgY2FuIGJlIGEgc3RyaW5nIG9mIHNwYWNlLXNlcGFyYXRlZCB3b3Jkc1xyXG5cdFx0dHlwZXMgPSBMLlV0aWwuc3BsaXRXb3Jkcyh0eXBlcyk7XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gdHlwZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0ZXZlbnQgPSB7XHJcblx0XHRcdFx0YWN0aW9uOiBmbixcclxuXHRcdFx0XHRjb250ZXh0OiBjb250ZXh0IHx8IHRoaXNcclxuXHRcdFx0fTtcclxuXHRcdFx0dHlwZSA9IHR5cGVzW2ldO1xyXG5cclxuXHRcdFx0aWYgKGNvbnRleHRJZCkge1xyXG5cdFx0XHRcdC8vIHN0b3JlIGxpc3RlbmVycyBvZiBhIHBhcnRpY3VsYXIgY29udGV4dCBpbiBhIHNlcGFyYXRlIGhhc2ggKGlmIGl0IGhhcyBhbiBpZClcclxuXHRcdFx0XHQvLyBnaXZlcyBhIG1ham9yIHBlcmZvcm1hbmNlIGJvb3N0IHdoZW4gcmVtb3ZpbmcgdGhvdXNhbmRzIG9mIG1hcCBsYXllcnNcclxuXHJcblx0XHRcdFx0aW5kZXhLZXkgPSB0eXBlICsgJ19pZHgnO1xyXG5cdFx0XHRcdGluZGV4TGVuS2V5ID0gaW5kZXhLZXkgKyAnX2xlbic7XHJcblxyXG5cdFx0XHRcdHR5cGVJbmRleCA9IGV2ZW50c1tpbmRleEtleV0gPSBldmVudHNbaW5kZXhLZXldIHx8IHt9O1xyXG5cclxuXHRcdFx0XHRpZiAoIXR5cGVJbmRleFtjb250ZXh0SWRdKSB7XHJcblx0XHRcdFx0XHR0eXBlSW5kZXhbY29udGV4dElkXSA9IFtdO1xyXG5cclxuXHRcdFx0XHRcdC8vIGtlZXAgdHJhY2sgb2YgdGhlIG51bWJlciBvZiBrZXlzIGluIHRoZSBpbmRleCB0byBxdWlja2x5IGNoZWNrIGlmIGl0J3MgZW1wdHlcclxuXHRcdFx0XHRcdGV2ZW50c1tpbmRleExlbktleV0gPSAoZXZlbnRzW2luZGV4TGVuS2V5XSB8fCAwKSArIDE7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHR0eXBlSW5kZXhbY29udGV4dElkXS5wdXNoKGV2ZW50KTtcclxuXHJcblxyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdGV2ZW50c1t0eXBlXSA9IGV2ZW50c1t0eXBlXSB8fCBbXTtcclxuXHRcdFx0XHRldmVudHNbdHlwZV0ucHVzaChldmVudCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRoYXNFdmVudExpc3RlbmVyczogZnVuY3Rpb24gKHR5cGUpIHsgLy8gKFN0cmluZykgLT4gQm9vbGVhblxyXG5cdFx0dmFyIGV2ZW50cyA9IHRoaXNbZXZlbnRzS2V5XTtcclxuXHRcdHJldHVybiAhIWV2ZW50cyAmJiAoKHR5cGUgaW4gZXZlbnRzICYmIGV2ZW50c1t0eXBlXS5sZW5ndGggPiAwKSB8fFxyXG5cdFx0ICAgICAgICAgICAgICAgICAgICAodHlwZSArICdfaWR4JyBpbiBldmVudHMgJiYgZXZlbnRzW3R5cGUgKyAnX2lkeF9sZW4nXSA+IDApKTtcclxuXHR9LFxyXG5cclxuXHRyZW1vdmVFdmVudExpc3RlbmVyOiBmdW5jdGlvbiAodHlwZXMsIGZuLCBjb250ZXh0KSB7IC8vIChbU3RyaW5nLCBGdW5jdGlvbiwgT2JqZWN0XSkgb3IgKE9iamVjdFssIE9iamVjdF0pXHJcblxyXG5cdFx0aWYgKCF0aGlzW2V2ZW50c0tleV0pIHtcclxuXHRcdFx0cmV0dXJuIHRoaXM7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKCF0eXBlcykge1xyXG5cdFx0XHRyZXR1cm4gdGhpcy5jbGVhckFsbEV2ZW50TGlzdGVuZXJzKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKEwuVXRpbC5pbnZva2VFYWNoKHR5cGVzLCB0aGlzLnJlbW92ZUV2ZW50TGlzdGVuZXIsIHRoaXMsIGZuLCBjb250ZXh0KSkgeyByZXR1cm4gdGhpczsgfVxyXG5cclxuXHRcdHZhciBldmVudHMgPSB0aGlzW2V2ZW50c0tleV0sXHJcblx0XHQgICAgY29udGV4dElkID0gY29udGV4dCAmJiBjb250ZXh0ICE9PSB0aGlzICYmIEwuc3RhbXAoY29udGV4dCksXHJcblx0XHQgICAgaSwgbGVuLCB0eXBlLCBsaXN0ZW5lcnMsIGosIGluZGV4S2V5LCBpbmRleExlbktleSwgdHlwZUluZGV4LCByZW1vdmVkO1xyXG5cclxuXHRcdHR5cGVzID0gTC5VdGlsLnNwbGl0V29yZHModHlwZXMpO1xyXG5cclxuXHRcdGZvciAoaSA9IDAsIGxlbiA9IHR5cGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdHR5cGUgPSB0eXBlc1tpXTtcclxuXHRcdFx0aW5kZXhLZXkgPSB0eXBlICsgJ19pZHgnO1xyXG5cdFx0XHRpbmRleExlbktleSA9IGluZGV4S2V5ICsgJ19sZW4nO1xyXG5cclxuXHRcdFx0dHlwZUluZGV4ID0gZXZlbnRzW2luZGV4S2V5XTtcclxuXHJcblx0XHRcdGlmICghZm4pIHtcclxuXHRcdFx0XHQvLyBjbGVhciBhbGwgbGlzdGVuZXJzIGZvciBhIHR5cGUgaWYgZnVuY3Rpb24gaXNuJ3Qgc3BlY2lmaWVkXHJcblx0XHRcdFx0ZGVsZXRlIGV2ZW50c1t0eXBlXTtcclxuXHRcdFx0XHRkZWxldGUgZXZlbnRzW2luZGV4S2V5XTtcclxuXHRcdFx0XHRkZWxldGUgZXZlbnRzW2luZGV4TGVuS2V5XTtcclxuXHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0bGlzdGVuZXJzID0gY29udGV4dElkICYmIHR5cGVJbmRleCA/IHR5cGVJbmRleFtjb250ZXh0SWRdIDogZXZlbnRzW3R5cGVdO1xyXG5cclxuXHRcdFx0XHRpZiAobGlzdGVuZXJzKSB7XHJcblx0XHRcdFx0XHRmb3IgKGogPSBsaXN0ZW5lcnMubGVuZ3RoIC0gMTsgaiA+PSAwOyBqLS0pIHtcclxuXHRcdFx0XHRcdFx0aWYgKChsaXN0ZW5lcnNbal0uYWN0aW9uID09PSBmbikgJiYgKCFjb250ZXh0IHx8IChsaXN0ZW5lcnNbal0uY29udGV4dCA9PT0gY29udGV4dCkpKSB7XHJcblx0XHRcdFx0XHRcdFx0cmVtb3ZlZCA9IGxpc3RlbmVycy5zcGxpY2UoaiwgMSk7XHJcblx0XHRcdFx0XHRcdFx0Ly8gc2V0IHRoZSBvbGQgYWN0aW9uIHRvIGEgbm8tb3AsIGJlY2F1c2UgaXQgaXMgcG9zc2libGVcclxuXHRcdFx0XHRcdFx0XHQvLyB0aGF0IHRoZSBsaXN0ZW5lciBpcyBiZWluZyBpdGVyYXRlZCBvdmVyIGFzIHBhcnQgb2YgYSBkaXNwYXRjaFxyXG5cdFx0XHRcdFx0XHRcdHJlbW92ZWRbMF0uYWN0aW9uID0gTC5VdGlsLmZhbHNlRm47XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0XHRpZiAoY29udGV4dCAmJiB0eXBlSW5kZXggJiYgKGxpc3RlbmVycy5sZW5ndGggPT09IDApKSB7XHJcblx0XHRcdFx0XHRcdGRlbGV0ZSB0eXBlSW5kZXhbY29udGV4dElkXTtcclxuXHRcdFx0XHRcdFx0ZXZlbnRzW2luZGV4TGVuS2V5XS0tO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGNsZWFyQWxsRXZlbnRMaXN0ZW5lcnM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGRlbGV0ZSB0aGlzW2V2ZW50c0tleV07XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRmaXJlRXZlbnQ6IGZ1bmN0aW9uICh0eXBlLCBkYXRhKSB7IC8vIChTdHJpbmdbLCBPYmplY3RdKVxyXG5cdFx0aWYgKCF0aGlzLmhhc0V2ZW50TGlzdGVuZXJzKHR5cGUpKSB7XHJcblx0XHRcdHJldHVybiB0aGlzO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBldmVudCA9IEwuVXRpbC5leHRlbmQoe30sIGRhdGEsIHsgdHlwZTogdHlwZSwgdGFyZ2V0OiB0aGlzIH0pO1xyXG5cclxuXHRcdHZhciBldmVudHMgPSB0aGlzW2V2ZW50c0tleV0sXHJcblx0XHQgICAgbGlzdGVuZXJzLCBpLCBsZW4sIHR5cGVJbmRleCwgY29udGV4dElkO1xyXG5cclxuXHRcdGlmIChldmVudHNbdHlwZV0pIHtcclxuXHRcdFx0Ly8gbWFrZSBzdXJlIGFkZGluZy9yZW1vdmluZyBsaXN0ZW5lcnMgaW5zaWRlIG90aGVyIGxpc3RlbmVycyB3b24ndCBjYXVzZSBpbmZpbml0ZSBsb29wXHJcblx0XHRcdGxpc3RlbmVycyA9IGV2ZW50c1t0eXBlXS5zbGljZSgpO1xyXG5cclxuXHRcdFx0Zm9yIChpID0gMCwgbGVuID0gbGlzdGVuZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdFx0bGlzdGVuZXJzW2ldLmFjdGlvbi5jYWxsKGxpc3RlbmVyc1tpXS5jb250ZXh0LCBldmVudCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHQvLyBmaXJlIGV2ZW50IGZvciB0aGUgY29udGV4dC1pbmRleGVkIGxpc3RlbmVycyBhcyB3ZWxsXHJcblx0XHR0eXBlSW5kZXggPSBldmVudHNbdHlwZSArICdfaWR4J107XHJcblxyXG5cdFx0Zm9yIChjb250ZXh0SWQgaW4gdHlwZUluZGV4KSB7XHJcblx0XHRcdGxpc3RlbmVycyA9IHR5cGVJbmRleFtjb250ZXh0SWRdLnNsaWNlKCk7XHJcblxyXG5cdFx0XHRpZiAobGlzdGVuZXJzKSB7XHJcblx0XHRcdFx0Zm9yIChpID0gMCwgbGVuID0gbGlzdGVuZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdFx0XHRsaXN0ZW5lcnNbaV0uYWN0aW9uLmNhbGwobGlzdGVuZXJzW2ldLmNvbnRleHQsIGV2ZW50KTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRhZGRPbmVUaW1lRXZlbnRMaXN0ZW5lcjogZnVuY3Rpb24gKHR5cGVzLCBmbiwgY29udGV4dCkge1xyXG5cclxuXHRcdGlmIChMLlV0aWwuaW52b2tlRWFjaCh0eXBlcywgdGhpcy5hZGRPbmVUaW1lRXZlbnRMaXN0ZW5lciwgdGhpcywgZm4sIGNvbnRleHQpKSB7IHJldHVybiB0aGlzOyB9XHJcblxyXG5cdFx0dmFyIGhhbmRsZXIgPSBMLmJpbmQoZnVuY3Rpb24gKCkge1xyXG5cdFx0XHR0aGlzXHJcblx0XHRcdCAgICAucmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlcywgZm4sIGNvbnRleHQpXHJcblx0XHRcdCAgICAucmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlcywgaGFuZGxlciwgY29udGV4dCk7XHJcblx0XHR9LCB0aGlzKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpc1xyXG5cdFx0ICAgIC5hZGRFdmVudExpc3RlbmVyKHR5cGVzLCBmbiwgY29udGV4dClcclxuXHRcdCAgICAuYWRkRXZlbnRMaXN0ZW5lcih0eXBlcywgaGFuZGxlciwgY29udGV4dCk7XHJcblx0fVxyXG59O1xyXG5cclxuTC5NaXhpbi5FdmVudHMub24gPSBMLk1peGluLkV2ZW50cy5hZGRFdmVudExpc3RlbmVyO1xyXG5MLk1peGluLkV2ZW50cy5vZmYgPSBMLk1peGluLkV2ZW50cy5yZW1vdmVFdmVudExpc3RlbmVyO1xyXG5MLk1peGluLkV2ZW50cy5vbmNlID0gTC5NaXhpbi5FdmVudHMuYWRkT25lVGltZUV2ZW50TGlzdGVuZXI7XHJcbkwuTWl4aW4uRXZlbnRzLmZpcmUgPSBMLk1peGluLkV2ZW50cy5maXJlRXZlbnQ7XHJcblxuXG4vKlxyXG4gKiBMLkJyb3dzZXIgaGFuZGxlcyBkaWZmZXJlbnQgYnJvd3NlciBhbmQgZmVhdHVyZSBkZXRlY3Rpb25zIGZvciBpbnRlcm5hbCBMZWFmbGV0IHVzZS5cclxuICovXHJcblxyXG4oZnVuY3Rpb24gKCkge1xyXG5cclxuXHR2YXIgaWUgPSAnQWN0aXZlWE9iamVjdCcgaW4gd2luZG93LFxyXG5cdFx0aWVsdDkgPSBpZSAmJiAhZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcixcclxuXHJcblx0ICAgIC8vIHRlcnJpYmxlIGJyb3dzZXIgZGV0ZWN0aW9uIHRvIHdvcmsgYXJvdW5kIFNhZmFyaSAvIGlPUyAvIEFuZHJvaWQgYnJvd3NlciBidWdzXHJcblx0ICAgIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLFxyXG5cdCAgICB3ZWJraXQgPSB1YS5pbmRleE9mKCd3ZWJraXQnKSAhPT0gLTEsXHJcblx0ICAgIGNocm9tZSA9IHVhLmluZGV4T2YoJ2Nocm9tZScpICE9PSAtMSxcclxuXHQgICAgcGhhbnRvbWpzID0gdWEuaW5kZXhPZigncGhhbnRvbScpICE9PSAtMSxcclxuXHQgICAgYW5kcm9pZCA9IHVhLmluZGV4T2YoJ2FuZHJvaWQnKSAhPT0gLTEsXHJcblx0ICAgIGFuZHJvaWQyMyA9IHVhLnNlYXJjaCgnYW5kcm9pZCBbMjNdJykgIT09IC0xLFxyXG5cdFx0Z2Vja28gPSB1YS5pbmRleE9mKCdnZWNrbycpICE9PSAtMSxcclxuXHJcblx0ICAgIG1vYmlsZSA9IHR5cGVvZiBvcmllbnRhdGlvbiAhPT0gdW5kZWZpbmVkICsgJycsXHJcblx0ICAgIG1zUG9pbnRlciA9IHdpbmRvdy5uYXZpZ2F0b3IgJiYgd2luZG93Lm5hdmlnYXRvci5tc1BvaW50ZXJFbmFibGVkICYmXHJcblx0ICAgICAgICAgICAgICB3aW5kb3cubmF2aWdhdG9yLm1zTWF4VG91Y2hQb2ludHMgJiYgIXdpbmRvdy5Qb2ludGVyRXZlbnQsXHJcblx0XHRwb2ludGVyID0gKHdpbmRvdy5Qb2ludGVyRXZlbnQgJiYgd2luZG93Lm5hdmlnYXRvci5wb2ludGVyRW5hYmxlZCAmJiB3aW5kb3cubmF2aWdhdG9yLm1heFRvdWNoUG9pbnRzKSB8fFxyXG5cdFx0XHRcdCAgbXNQb2ludGVyLFxyXG5cdCAgICByZXRpbmEgPSAoJ2RldmljZVBpeGVsUmF0aW8nIGluIHdpbmRvdyAmJiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyA+IDEpIHx8XHJcblx0ICAgICAgICAgICAgICgnbWF0Y2hNZWRpYScgaW4gd2luZG93ICYmIHdpbmRvdy5tYXRjaE1lZGlhKCcobWluLXJlc29sdXRpb246MTQ0ZHBpKScpICYmXHJcblx0ICAgICAgICAgICAgICB3aW5kb3cubWF0Y2hNZWRpYSgnKG1pbi1yZXNvbHV0aW9uOjE0NGRwaSknKS5tYXRjaGVzKSxcclxuXHJcblx0ICAgIGRvYyA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCxcclxuXHQgICAgaWUzZCA9IGllICYmICgndHJhbnNpdGlvbicgaW4gZG9jLnN0eWxlKSxcclxuXHQgICAgd2Via2l0M2QgPSAoJ1dlYktpdENTU01hdHJpeCcgaW4gd2luZG93KSAmJiAoJ20xMScgaW4gbmV3IHdpbmRvdy5XZWJLaXRDU1NNYXRyaXgoKSkgJiYgIWFuZHJvaWQyMyxcclxuXHQgICAgZ2Vja28zZCA9ICdNb3pQZXJzcGVjdGl2ZScgaW4gZG9jLnN0eWxlLFxyXG5cdCAgICBvcGVyYTNkID0gJ09UcmFuc2l0aW9uJyBpbiBkb2Muc3R5bGUsXHJcblx0ICAgIGFueTNkID0gIXdpbmRvdy5MX0RJU0FCTEVfM0QgJiYgKGllM2QgfHwgd2Via2l0M2QgfHwgZ2Vja28zZCB8fCBvcGVyYTNkKSAmJiAhcGhhbnRvbWpzO1xyXG5cclxuXHJcblx0Ly8gUGhhbnRvbUpTIGhhcyAnb250b3VjaHN0YXJ0JyBpbiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIGJ1dCBkb2Vzbid0IGFjdHVhbGx5IHN1cHBvcnQgdG91Y2guXHJcblx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL0xlYWZsZXQvTGVhZmxldC9wdWxsLzE0MzQjaXNzdWVjb21tZW50LTEzODQzMTUxXHJcblxyXG5cdHZhciB0b3VjaCA9ICF3aW5kb3cuTF9OT19UT1VDSCAmJiAhcGhhbnRvbWpzICYmIChmdW5jdGlvbiAoKSB7XHJcblxyXG5cdFx0dmFyIHN0YXJ0TmFtZSA9ICdvbnRvdWNoc3RhcnQnO1xyXG5cclxuXHRcdC8vIElFMTArIChXZSBzaW11bGF0ZSB0aGVzZSBpbnRvIHRvdWNoKiBldmVudHMgaW4gTC5Eb21FdmVudCBhbmQgTC5Eb21FdmVudC5Qb2ludGVyKSBvciBXZWJLaXQsIGV0Yy5cclxuXHRcdGlmIChwb2ludGVyIHx8IChzdGFydE5hbWUgaW4gZG9jKSkge1xyXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBGaXJlZm94L0dlY2tvXHJcblx0XHR2YXIgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JyksXHJcblx0XHQgICAgc3VwcG9ydGVkID0gZmFsc2U7XHJcblxyXG5cdFx0aWYgKCFkaXYuc2V0QXR0cmlidXRlKSB7XHJcblx0XHRcdHJldHVybiBmYWxzZTtcclxuXHRcdH1cclxuXHRcdGRpdi5zZXRBdHRyaWJ1dGUoc3RhcnROYW1lLCAncmV0dXJuOycpO1xyXG5cclxuXHRcdGlmICh0eXBlb2YgZGl2W3N0YXJ0TmFtZV0gPT09ICdmdW5jdGlvbicpIHtcclxuXHRcdFx0c3VwcG9ydGVkID0gdHJ1ZTtcclxuXHRcdH1cclxuXHJcblx0XHRkaXYucmVtb3ZlQXR0cmlidXRlKHN0YXJ0TmFtZSk7XHJcblx0XHRkaXYgPSBudWxsO1xyXG5cclxuXHRcdHJldHVybiBzdXBwb3J0ZWQ7XHJcblx0fSgpKTtcclxuXHJcblxyXG5cdEwuQnJvd3NlciA9IHtcclxuXHRcdGllOiBpZSxcclxuXHRcdGllbHQ5OiBpZWx0OSxcclxuXHRcdHdlYmtpdDogd2Via2l0LFxyXG5cdFx0Z2Vja286IGdlY2tvICYmICF3ZWJraXQgJiYgIXdpbmRvdy5vcGVyYSAmJiAhaWUsXHJcblxyXG5cdFx0YW5kcm9pZDogYW5kcm9pZCxcclxuXHRcdGFuZHJvaWQyMzogYW5kcm9pZDIzLFxyXG5cclxuXHRcdGNocm9tZTogY2hyb21lLFxyXG5cclxuXHRcdGllM2Q6IGllM2QsXHJcblx0XHR3ZWJraXQzZDogd2Via2l0M2QsXHJcblx0XHRnZWNrbzNkOiBnZWNrbzNkLFxyXG5cdFx0b3BlcmEzZDogb3BlcmEzZCxcclxuXHRcdGFueTNkOiBhbnkzZCxcclxuXHJcblx0XHRtb2JpbGU6IG1vYmlsZSxcclxuXHRcdG1vYmlsZVdlYmtpdDogbW9iaWxlICYmIHdlYmtpdCxcclxuXHRcdG1vYmlsZVdlYmtpdDNkOiBtb2JpbGUgJiYgd2Via2l0M2QsXHJcblx0XHRtb2JpbGVPcGVyYTogbW9iaWxlICYmIHdpbmRvdy5vcGVyYSxcclxuXHJcblx0XHR0b3VjaDogdG91Y2gsXHJcblx0XHRtc1BvaW50ZXI6IG1zUG9pbnRlcixcclxuXHRcdHBvaW50ZXI6IHBvaW50ZXIsXHJcblxyXG5cdFx0cmV0aW5hOiByZXRpbmFcclxuXHR9O1xyXG5cclxufSgpKTtcclxuXG5cbi8qXHJcbiAqIEwuUG9pbnQgcmVwcmVzZW50cyBhIHBvaW50IHdpdGggeCBhbmQgeSBjb29yZGluYXRlcy5cclxuICovXHJcblxyXG5MLlBvaW50ID0gZnVuY3Rpb24gKC8qTnVtYmVyKi8geCwgLypOdW1iZXIqLyB5LCAvKkJvb2xlYW4qLyByb3VuZCkge1xyXG5cdHRoaXMueCA9IChyb3VuZCA/IE1hdGgucm91bmQoeCkgOiB4KTtcclxuXHR0aGlzLnkgPSAocm91bmQgPyBNYXRoLnJvdW5kKHkpIDogeSk7XHJcbn07XHJcblxyXG5MLlBvaW50LnByb3RvdHlwZSA9IHtcclxuXHJcblx0Y2xvbmU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiBuZXcgTC5Qb2ludCh0aGlzLngsIHRoaXMueSk7XHJcblx0fSxcclxuXHJcblx0Ly8gbm9uLWRlc3RydWN0aXZlLCByZXR1cm5zIGEgbmV3IHBvaW50XHJcblx0YWRkOiBmdW5jdGlvbiAocG9pbnQpIHtcclxuXHRcdHJldHVybiB0aGlzLmNsb25lKCkuX2FkZChMLnBvaW50KHBvaW50KSk7XHJcblx0fSxcclxuXHJcblx0Ly8gZGVzdHJ1Y3RpdmUsIHVzZWQgZGlyZWN0bHkgZm9yIHBlcmZvcm1hbmNlIGluIHNpdHVhdGlvbnMgd2hlcmUgaXQncyBzYWZlIHRvIG1vZGlmeSBleGlzdGluZyBwb2ludFxyXG5cdF9hZGQ6IGZ1bmN0aW9uIChwb2ludCkge1xyXG5cdFx0dGhpcy54ICs9IHBvaW50Lng7XHJcblx0XHR0aGlzLnkgKz0gcG9pbnQueTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHN1YnRyYWN0OiBmdW5jdGlvbiAocG9pbnQpIHtcclxuXHRcdHJldHVybiB0aGlzLmNsb25lKCkuX3N1YnRyYWN0KEwucG9pbnQocG9pbnQpKTtcclxuXHR9LFxyXG5cclxuXHRfc3VidHJhY3Q6IGZ1bmN0aW9uIChwb2ludCkge1xyXG5cdFx0dGhpcy54IC09IHBvaW50Lng7XHJcblx0XHR0aGlzLnkgLT0gcG9pbnQueTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGRpdmlkZUJ5OiBmdW5jdGlvbiAobnVtKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5jbG9uZSgpLl9kaXZpZGVCeShudW0pO1xyXG5cdH0sXHJcblxyXG5cdF9kaXZpZGVCeTogZnVuY3Rpb24gKG51bSkge1xyXG5cdFx0dGhpcy54IC89IG51bTtcclxuXHRcdHRoaXMueSAvPSBudW07XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRtdWx0aXBseUJ5OiBmdW5jdGlvbiAobnVtKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5jbG9uZSgpLl9tdWx0aXBseUJ5KG51bSk7XHJcblx0fSxcclxuXHJcblx0X211bHRpcGx5Qnk6IGZ1bmN0aW9uIChudW0pIHtcclxuXHRcdHRoaXMueCAqPSBudW07XHJcblx0XHR0aGlzLnkgKj0gbnVtO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cm91bmQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLmNsb25lKCkuX3JvdW5kKCk7XHJcblx0fSxcclxuXHJcblx0X3JvdW5kOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLnggPSBNYXRoLnJvdW5kKHRoaXMueCk7XHJcblx0XHR0aGlzLnkgPSBNYXRoLnJvdW5kKHRoaXMueSk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRmbG9vcjogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuY2xvbmUoKS5fZmxvb3IoKTtcclxuXHR9LFxyXG5cclxuXHRfZmxvb3I6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHRoaXMueCA9IE1hdGguZmxvb3IodGhpcy54KTtcclxuXHRcdHRoaXMueSA9IE1hdGguZmxvb3IodGhpcy55KTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGRpc3RhbmNlVG86IGZ1bmN0aW9uIChwb2ludCkge1xyXG5cdFx0cG9pbnQgPSBMLnBvaW50KHBvaW50KTtcclxuXHJcblx0XHR2YXIgeCA9IHBvaW50LnggLSB0aGlzLngsXHJcblx0XHQgICAgeSA9IHBvaW50LnkgLSB0aGlzLnk7XHJcblxyXG5cdFx0cmV0dXJuIE1hdGguc3FydCh4ICogeCArIHkgKiB5KTtcclxuXHR9LFxyXG5cclxuXHRlcXVhbHM6IGZ1bmN0aW9uIChwb2ludCkge1xyXG5cdFx0cG9pbnQgPSBMLnBvaW50KHBvaW50KTtcclxuXHJcblx0XHRyZXR1cm4gcG9pbnQueCA9PT0gdGhpcy54ICYmXHJcblx0XHQgICAgICAgcG9pbnQueSA9PT0gdGhpcy55O1xyXG5cdH0sXHJcblxyXG5cdGNvbnRhaW5zOiBmdW5jdGlvbiAocG9pbnQpIHtcclxuXHRcdHBvaW50ID0gTC5wb2ludChwb2ludCk7XHJcblxyXG5cdFx0cmV0dXJuIE1hdGguYWJzKHBvaW50LngpIDw9IE1hdGguYWJzKHRoaXMueCkgJiZcclxuXHRcdCAgICAgICBNYXRoLmFicyhwb2ludC55KSA8PSBNYXRoLmFicyh0aGlzLnkpO1xyXG5cdH0sXHJcblxyXG5cdHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gJ1BvaW50KCcgK1xyXG5cdFx0ICAgICAgICBMLlV0aWwuZm9ybWF0TnVtKHRoaXMueCkgKyAnLCAnICtcclxuXHRcdCAgICAgICAgTC5VdGlsLmZvcm1hdE51bSh0aGlzLnkpICsgJyknO1xyXG5cdH1cclxufTtcclxuXHJcbkwucG9pbnQgPSBmdW5jdGlvbiAoeCwgeSwgcm91bmQpIHtcclxuXHRpZiAoeCBpbnN0YW5jZW9mIEwuUG9pbnQpIHtcclxuXHRcdHJldHVybiB4O1xyXG5cdH1cclxuXHRpZiAoTC5VdGlsLmlzQXJyYXkoeCkpIHtcclxuXHRcdHJldHVybiBuZXcgTC5Qb2ludCh4WzBdLCB4WzFdKTtcclxuXHR9XHJcblx0aWYgKHggPT09IHVuZGVmaW5lZCB8fCB4ID09PSBudWxsKSB7XHJcblx0XHRyZXR1cm4geDtcclxuXHR9XHJcblx0cmV0dXJuIG5ldyBMLlBvaW50KHgsIHksIHJvdW5kKTtcclxufTtcclxuXG5cbi8qXHJcbiAqIEwuQm91bmRzIHJlcHJlc2VudHMgYSByZWN0YW5ndWxhciBhcmVhIG9uIHRoZSBzY3JlZW4gaW4gcGl4ZWwgY29vcmRpbmF0ZXMuXHJcbiAqL1xyXG5cclxuTC5Cb3VuZHMgPSBmdW5jdGlvbiAoYSwgYikgeyAvLyhQb2ludCwgUG9pbnQpIG9yIFBvaW50W11cclxuXHRpZiAoIWEpIHsgcmV0dXJuOyB9XHJcblxyXG5cdHZhciBwb2ludHMgPSBiID8gW2EsIGJdIDogYTtcclxuXHJcblx0Zm9yICh2YXIgaSA9IDAsIGxlbiA9IHBvaW50cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0dGhpcy5leHRlbmQocG9pbnRzW2ldKTtcclxuXHR9XHJcbn07XHJcblxyXG5MLkJvdW5kcy5wcm90b3R5cGUgPSB7XHJcblx0Ly8gZXh0ZW5kIHRoZSBib3VuZHMgdG8gY29udGFpbiB0aGUgZ2l2ZW4gcG9pbnRcclxuXHRleHRlbmQ6IGZ1bmN0aW9uIChwb2ludCkgeyAvLyAoUG9pbnQpXHJcblx0XHRwb2ludCA9IEwucG9pbnQocG9pbnQpO1xyXG5cclxuXHRcdGlmICghdGhpcy5taW4gJiYgIXRoaXMubWF4KSB7XHJcblx0XHRcdHRoaXMubWluID0gcG9pbnQuY2xvbmUoKTtcclxuXHRcdFx0dGhpcy5tYXggPSBwb2ludC5jbG9uZSgpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0dGhpcy5taW4ueCA9IE1hdGgubWluKHBvaW50LngsIHRoaXMubWluLngpO1xyXG5cdFx0XHR0aGlzLm1heC54ID0gTWF0aC5tYXgocG9pbnQueCwgdGhpcy5tYXgueCk7XHJcblx0XHRcdHRoaXMubWluLnkgPSBNYXRoLm1pbihwb2ludC55LCB0aGlzLm1pbi55KTtcclxuXHRcdFx0dGhpcy5tYXgueSA9IE1hdGgubWF4KHBvaW50LnksIHRoaXMubWF4LnkpO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0Z2V0Q2VudGVyOiBmdW5jdGlvbiAocm91bmQpIHsgLy8gKEJvb2xlYW4pIC0+IFBvaW50XHJcblx0XHRyZXR1cm4gbmV3IEwuUG9pbnQoXHJcblx0XHQgICAgICAgICh0aGlzLm1pbi54ICsgdGhpcy5tYXgueCkgLyAyLFxyXG5cdFx0ICAgICAgICAodGhpcy5taW4ueSArIHRoaXMubWF4LnkpIC8gMiwgcm91bmQpO1xyXG5cdH0sXHJcblxyXG5cdGdldEJvdHRvbUxlZnQ6IGZ1bmN0aW9uICgpIHsgLy8gLT4gUG9pbnRcclxuXHRcdHJldHVybiBuZXcgTC5Qb2ludCh0aGlzLm1pbi54LCB0aGlzLm1heC55KTtcclxuXHR9LFxyXG5cclxuXHRnZXRUb3BSaWdodDogZnVuY3Rpb24gKCkgeyAvLyAtPiBQb2ludFxyXG5cdFx0cmV0dXJuIG5ldyBMLlBvaW50KHRoaXMubWF4LngsIHRoaXMubWluLnkpO1xyXG5cdH0sXHJcblxyXG5cdGdldFNpemU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLm1heC5zdWJ0cmFjdCh0aGlzLm1pbik7XHJcblx0fSxcclxuXHJcblx0Y29udGFpbnM6IGZ1bmN0aW9uIChvYmopIHsgLy8gKEJvdW5kcykgb3IgKFBvaW50KSAtPiBCb29sZWFuXHJcblx0XHR2YXIgbWluLCBtYXg7XHJcblxyXG5cdFx0aWYgKHR5cGVvZiBvYmpbMF0gPT09ICdudW1iZXInIHx8IG9iaiBpbnN0YW5jZW9mIEwuUG9pbnQpIHtcclxuXHRcdFx0b2JqID0gTC5wb2ludChvYmopO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0b2JqID0gTC5ib3VuZHMob2JqKTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAob2JqIGluc3RhbmNlb2YgTC5Cb3VuZHMpIHtcclxuXHRcdFx0bWluID0gb2JqLm1pbjtcclxuXHRcdFx0bWF4ID0gb2JqLm1heDtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdG1pbiA9IG1heCA9IG9iajtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gKG1pbi54ID49IHRoaXMubWluLngpICYmXHJcblx0XHQgICAgICAgKG1heC54IDw9IHRoaXMubWF4LngpICYmXHJcblx0XHQgICAgICAgKG1pbi55ID49IHRoaXMubWluLnkpICYmXHJcblx0XHQgICAgICAgKG1heC55IDw9IHRoaXMubWF4LnkpO1xyXG5cdH0sXHJcblxyXG5cdGludGVyc2VjdHM6IGZ1bmN0aW9uIChib3VuZHMpIHsgLy8gKEJvdW5kcykgLT4gQm9vbGVhblxyXG5cdFx0Ym91bmRzID0gTC5ib3VuZHMoYm91bmRzKTtcclxuXHJcblx0XHR2YXIgbWluID0gdGhpcy5taW4sXHJcblx0XHQgICAgbWF4ID0gdGhpcy5tYXgsXHJcblx0XHQgICAgbWluMiA9IGJvdW5kcy5taW4sXHJcblx0XHQgICAgbWF4MiA9IGJvdW5kcy5tYXgsXHJcblx0XHQgICAgeEludGVyc2VjdHMgPSAobWF4Mi54ID49IG1pbi54KSAmJiAobWluMi54IDw9IG1heC54KSxcclxuXHRcdCAgICB5SW50ZXJzZWN0cyA9IChtYXgyLnkgPj0gbWluLnkpICYmIChtaW4yLnkgPD0gbWF4LnkpO1xyXG5cclxuXHRcdHJldHVybiB4SW50ZXJzZWN0cyAmJiB5SW50ZXJzZWN0cztcclxuXHR9LFxyXG5cclxuXHRpc1ZhbGlkOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gISEodGhpcy5taW4gJiYgdGhpcy5tYXgpO1xyXG5cdH1cclxufTtcclxuXHJcbkwuYm91bmRzID0gZnVuY3Rpb24gKGEsIGIpIHsgLy8gKEJvdW5kcykgb3IgKFBvaW50LCBQb2ludCkgb3IgKFBvaW50W10pXHJcblx0aWYgKCFhIHx8IGEgaW5zdGFuY2VvZiBMLkJvdW5kcykge1xyXG5cdFx0cmV0dXJuIGE7XHJcblx0fVxyXG5cdHJldHVybiBuZXcgTC5Cb3VuZHMoYSwgYik7XHJcbn07XHJcblxuXG4vKlxyXG4gKiBMLlRyYW5zZm9ybWF0aW9uIGlzIGFuIHV0aWxpdHkgY2xhc3MgdG8gcGVyZm9ybSBzaW1wbGUgcG9pbnQgdHJhbnNmb3JtYXRpb25zIHRocm91Z2ggYSAyZC1tYXRyaXguXHJcbiAqL1xyXG5cclxuTC5UcmFuc2Zvcm1hdGlvbiA9IGZ1bmN0aW9uIChhLCBiLCBjLCBkKSB7XHJcblx0dGhpcy5fYSA9IGE7XHJcblx0dGhpcy5fYiA9IGI7XHJcblx0dGhpcy5fYyA9IGM7XHJcblx0dGhpcy5fZCA9IGQ7XHJcbn07XHJcblxyXG5MLlRyYW5zZm9ybWF0aW9uLnByb3RvdHlwZSA9IHtcclxuXHR0cmFuc2Zvcm06IGZ1bmN0aW9uIChwb2ludCwgc2NhbGUpIHsgLy8gKFBvaW50LCBOdW1iZXIpIC0+IFBvaW50XHJcblx0XHRyZXR1cm4gdGhpcy5fdHJhbnNmb3JtKHBvaW50LmNsb25lKCksIHNjYWxlKTtcclxuXHR9LFxyXG5cclxuXHQvLyBkZXN0cnVjdGl2ZSB0cmFuc2Zvcm0gKGZhc3RlcilcclxuXHRfdHJhbnNmb3JtOiBmdW5jdGlvbiAocG9pbnQsIHNjYWxlKSB7XHJcblx0XHRzY2FsZSA9IHNjYWxlIHx8IDE7XHJcblx0XHRwb2ludC54ID0gc2NhbGUgKiAodGhpcy5fYSAqIHBvaW50LnggKyB0aGlzLl9iKTtcclxuXHRcdHBvaW50LnkgPSBzY2FsZSAqICh0aGlzLl9jICogcG9pbnQueSArIHRoaXMuX2QpO1xyXG5cdFx0cmV0dXJuIHBvaW50O1xyXG5cdH0sXHJcblxyXG5cdHVudHJhbnNmb3JtOiBmdW5jdGlvbiAocG9pbnQsIHNjYWxlKSB7XHJcblx0XHRzY2FsZSA9IHNjYWxlIHx8IDE7XHJcblx0XHRyZXR1cm4gbmV3IEwuUG9pbnQoXHJcblx0XHQgICAgICAgIChwb2ludC54IC8gc2NhbGUgLSB0aGlzLl9iKSAvIHRoaXMuX2EsXHJcblx0XHQgICAgICAgIChwb2ludC55IC8gc2NhbGUgLSB0aGlzLl9kKSAvIHRoaXMuX2MpO1xyXG5cdH1cclxufTtcclxuXG5cbi8qXHJcbiAqIEwuRG9tVXRpbCBjb250YWlucyB2YXJpb3VzIHV0aWxpdHkgZnVuY3Rpb25zIGZvciB3b3JraW5nIHdpdGggRE9NLlxyXG4gKi9cclxuXHJcbkwuRG9tVXRpbCA9IHtcclxuXHRnZXQ6IGZ1bmN0aW9uIChpZCkge1xyXG5cdFx0cmV0dXJuICh0eXBlb2YgaWQgPT09ICdzdHJpbmcnID8gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpIDogaWQpO1xyXG5cdH0sXHJcblxyXG5cdGdldFN0eWxlOiBmdW5jdGlvbiAoZWwsIHN0eWxlKSB7XHJcblxyXG5cdFx0dmFyIHZhbHVlID0gZWwuc3R5bGVbc3R5bGVdO1xyXG5cclxuXHRcdGlmICghdmFsdWUgJiYgZWwuY3VycmVudFN0eWxlKSB7XHJcblx0XHRcdHZhbHVlID0gZWwuY3VycmVudFN0eWxlW3N0eWxlXTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoKCF2YWx1ZSB8fCB2YWx1ZSA9PT0gJ2F1dG8nKSAmJiBkb2N1bWVudC5kZWZhdWx0Vmlldykge1xyXG5cdFx0XHR2YXIgY3NzID0gZG9jdW1lbnQuZGVmYXVsdFZpZXcuZ2V0Q29tcHV0ZWRTdHlsZShlbCwgbnVsbCk7XHJcblx0XHRcdHZhbHVlID0gY3NzID8gY3NzW3N0eWxlXSA6IG51bGw7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHZhbHVlID09PSAnYXV0bycgPyBudWxsIDogdmFsdWU7XHJcblx0fSxcclxuXHJcblx0Z2V0Vmlld3BvcnRPZmZzZXQ6IGZ1bmN0aW9uIChlbGVtZW50KSB7XHJcblxyXG5cdFx0dmFyIHRvcCA9IDAsXHJcblx0XHQgICAgbGVmdCA9IDAsXHJcblx0XHQgICAgZWwgPSBlbGVtZW50LFxyXG5cdFx0ICAgIGRvY0JvZHkgPSBkb2N1bWVudC5ib2R5LFxyXG5cdFx0ICAgIGRvY0VsID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LFxyXG5cdFx0ICAgIHBvcztcclxuXHJcblx0XHRkbyB7XHJcblx0XHRcdHRvcCAgKz0gZWwub2Zmc2V0VG9wICB8fCAwO1xyXG5cdFx0XHRsZWZ0ICs9IGVsLm9mZnNldExlZnQgfHwgMDtcclxuXHJcblx0XHRcdC8vYWRkIGJvcmRlcnNcclxuXHRcdFx0dG9wICs9IHBhcnNlSW50KEwuRG9tVXRpbC5nZXRTdHlsZShlbCwgJ2JvcmRlclRvcFdpZHRoJyksIDEwKSB8fCAwO1xyXG5cdFx0XHRsZWZ0ICs9IHBhcnNlSW50KEwuRG9tVXRpbC5nZXRTdHlsZShlbCwgJ2JvcmRlckxlZnRXaWR0aCcpLCAxMCkgfHwgMDtcclxuXHJcblx0XHRcdHBvcyA9IEwuRG9tVXRpbC5nZXRTdHlsZShlbCwgJ3Bvc2l0aW9uJyk7XHJcblxyXG5cdFx0XHRpZiAoZWwub2Zmc2V0UGFyZW50ID09PSBkb2NCb2R5ICYmIHBvcyA9PT0gJ2Fic29sdXRlJykgeyBicmVhazsgfVxyXG5cclxuXHRcdFx0aWYgKHBvcyA9PT0gJ2ZpeGVkJykge1xyXG5cdFx0XHRcdHRvcCAgKz0gZG9jQm9keS5zY3JvbGxUb3AgIHx8IGRvY0VsLnNjcm9sbFRvcCAgfHwgMDtcclxuXHRcdFx0XHRsZWZ0ICs9IGRvY0JvZHkuc2Nyb2xsTGVmdCB8fCBkb2NFbC5zY3JvbGxMZWZ0IHx8IDA7XHJcblx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGlmIChwb3MgPT09ICdyZWxhdGl2ZScgJiYgIWVsLm9mZnNldExlZnQpIHtcclxuXHRcdFx0XHR2YXIgd2lkdGggPSBMLkRvbVV0aWwuZ2V0U3R5bGUoZWwsICd3aWR0aCcpLFxyXG5cdFx0XHRcdCAgICBtYXhXaWR0aCA9IEwuRG9tVXRpbC5nZXRTdHlsZShlbCwgJ21heC13aWR0aCcpLFxyXG5cdFx0XHRcdCAgICByID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcblxyXG5cdFx0XHRcdGlmICh3aWR0aCAhPT0gJ25vbmUnIHx8IG1heFdpZHRoICE9PSAnbm9uZScpIHtcclxuXHRcdFx0XHRcdGxlZnQgKz0gci5sZWZ0ICsgZWwuY2xpZW50TGVmdDtcclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdC8vY2FsY3VsYXRlIGZ1bGwgeSBvZmZzZXQgc2luY2Ugd2UncmUgYnJlYWtpbmcgb3V0IG9mIHRoZSBsb29wXHJcblx0XHRcdFx0dG9wICs9IHIudG9wICsgKGRvY0JvZHkuc2Nyb2xsVG9wICB8fCBkb2NFbC5zY3JvbGxUb3AgIHx8IDApO1xyXG5cclxuXHRcdFx0XHRicmVhaztcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0ZWwgPSBlbC5vZmZzZXRQYXJlbnQ7XHJcblxyXG5cdFx0fSB3aGlsZSAoZWwpO1xyXG5cclxuXHRcdGVsID0gZWxlbWVudDtcclxuXHJcblx0XHRkbyB7XHJcblx0XHRcdGlmIChlbCA9PT0gZG9jQm9keSkgeyBicmVhazsgfVxyXG5cclxuXHRcdFx0dG9wICAtPSBlbC5zY3JvbGxUb3AgIHx8IDA7XHJcblx0XHRcdGxlZnQgLT0gZWwuc2Nyb2xsTGVmdCB8fCAwO1xyXG5cclxuXHRcdFx0ZWwgPSBlbC5wYXJlbnROb2RlO1xyXG5cdFx0fSB3aGlsZSAoZWwpO1xyXG5cclxuXHRcdHJldHVybiBuZXcgTC5Qb2ludChsZWZ0LCB0b3ApO1xyXG5cdH0sXHJcblxyXG5cdGRvY3VtZW50SXNMdHI6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICghTC5Eb21VdGlsLl9kb2NJc0x0ckNhY2hlZCkge1xyXG5cdFx0XHRMLkRvbVV0aWwuX2RvY0lzTHRyQ2FjaGVkID0gdHJ1ZTtcclxuXHRcdFx0TC5Eb21VdGlsLl9kb2NJc0x0ciA9IEwuRG9tVXRpbC5nZXRTdHlsZShkb2N1bWVudC5ib2R5LCAnZGlyZWN0aW9uJykgPT09ICdsdHInO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIEwuRG9tVXRpbC5fZG9jSXNMdHI7XHJcblx0fSxcclxuXHJcblx0Y3JlYXRlOiBmdW5jdGlvbiAodGFnTmFtZSwgY2xhc3NOYW1lLCBjb250YWluZXIpIHtcclxuXHJcblx0XHR2YXIgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRhZ05hbWUpO1xyXG5cdFx0ZWwuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xyXG5cclxuXHRcdGlmIChjb250YWluZXIpIHtcclxuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGVsKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gZWw7XHJcblx0fSxcclxuXHJcblx0aGFzQ2xhc3M6IGZ1bmN0aW9uIChlbCwgbmFtZSkge1xyXG5cdFx0aWYgKGVsLmNsYXNzTGlzdCAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdHJldHVybiBlbC5jbGFzc0xpc3QuY29udGFpbnMobmFtZSk7XHJcblx0XHR9XHJcblx0XHR2YXIgY2xhc3NOYW1lID0gTC5Eb21VdGlsLl9nZXRDbGFzcyhlbCk7XHJcblx0XHRyZXR1cm4gY2xhc3NOYW1lLmxlbmd0aCA+IDAgJiYgbmV3IFJlZ0V4cCgnKF58XFxcXHMpJyArIG5hbWUgKyAnKFxcXFxzfCQpJykudGVzdChjbGFzc05hbWUpO1xyXG5cdH0sXHJcblxyXG5cdGFkZENsYXNzOiBmdW5jdGlvbiAoZWwsIG5hbWUpIHtcclxuXHRcdGlmIChlbC5jbGFzc0xpc3QgIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHR2YXIgY2xhc3NlcyA9IEwuVXRpbC5zcGxpdFdvcmRzKG5hbWUpO1xyXG5cdFx0XHRmb3IgKHZhciBpID0gMCwgbGVuID0gY2xhc3Nlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHRcdGVsLmNsYXNzTGlzdC5hZGQoY2xhc3Nlc1tpXSk7XHJcblx0XHRcdH1cclxuXHRcdH0gZWxzZSBpZiAoIUwuRG9tVXRpbC5oYXNDbGFzcyhlbCwgbmFtZSkpIHtcclxuXHRcdFx0dmFyIGNsYXNzTmFtZSA9IEwuRG9tVXRpbC5fZ2V0Q2xhc3MoZWwpO1xyXG5cdFx0XHRMLkRvbVV0aWwuX3NldENsYXNzKGVsLCAoY2xhc3NOYW1lID8gY2xhc3NOYW1lICsgJyAnIDogJycpICsgbmFtZSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlQ2xhc3M6IGZ1bmN0aW9uIChlbCwgbmFtZSkge1xyXG5cdFx0aWYgKGVsLmNsYXNzTGlzdCAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdGVsLmNsYXNzTGlzdC5yZW1vdmUobmFtZSk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRMLkRvbVV0aWwuX3NldENsYXNzKGVsLCBMLlV0aWwudHJpbSgoJyAnICsgTC5Eb21VdGlsLl9nZXRDbGFzcyhlbCkgKyAnICcpLnJlcGxhY2UoJyAnICsgbmFtZSArICcgJywgJyAnKSkpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9zZXRDbGFzczogZnVuY3Rpb24gKGVsLCBuYW1lKSB7XHJcblx0XHRpZiAoZWwuY2xhc3NOYW1lLmJhc2VWYWwgPT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHRlbC5jbGFzc05hbWUgPSBuYW1lO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0Ly8gaW4gY2FzZSBvZiBTVkcgZWxlbWVudFxyXG5cdFx0XHRlbC5jbGFzc05hbWUuYmFzZVZhbCA9IG5hbWU7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2dldENsYXNzOiBmdW5jdGlvbiAoZWwpIHtcclxuXHRcdHJldHVybiBlbC5jbGFzc05hbWUuYmFzZVZhbCA9PT0gdW5kZWZpbmVkID8gZWwuY2xhc3NOYW1lIDogZWwuY2xhc3NOYW1lLmJhc2VWYWw7XHJcblx0fSxcclxuXHJcblx0c2V0T3BhY2l0eTogZnVuY3Rpb24gKGVsLCB2YWx1ZSkge1xyXG5cclxuXHRcdGlmICgnb3BhY2l0eScgaW4gZWwuc3R5bGUpIHtcclxuXHRcdFx0ZWwuc3R5bGUub3BhY2l0eSA9IHZhbHVlO1xyXG5cclxuXHRcdH0gZWxzZSBpZiAoJ2ZpbHRlcicgaW4gZWwuc3R5bGUpIHtcclxuXHJcblx0XHRcdHZhciBmaWx0ZXIgPSBmYWxzZSxcclxuXHRcdFx0ICAgIGZpbHRlck5hbWUgPSAnRFhJbWFnZVRyYW5zZm9ybS5NaWNyb3NvZnQuQWxwaGEnO1xyXG5cclxuXHRcdFx0Ly8gZmlsdGVycyBjb2xsZWN0aW9uIHRocm93cyBhbiBlcnJvciBpZiB3ZSB0cnkgdG8gcmV0cmlldmUgYSBmaWx0ZXIgdGhhdCBkb2Vzbid0IGV4aXN0XHJcblx0XHRcdHRyeSB7XHJcblx0XHRcdFx0ZmlsdGVyID0gZWwuZmlsdGVycy5pdGVtKGZpbHRlck5hbWUpO1xyXG5cdFx0XHR9IGNhdGNoIChlKSB7XHJcblx0XHRcdFx0Ly8gZG9uJ3Qgc2V0IG9wYWNpdHkgdG8gMSBpZiB3ZSBoYXZlbid0IGFscmVhZHkgc2V0IGFuIG9wYWNpdHksXHJcblx0XHRcdFx0Ly8gaXQgaXNuJ3QgbmVlZGVkIGFuZCBicmVha3MgdHJhbnNwYXJlbnQgcG5ncy5cclxuXHRcdFx0XHRpZiAodmFsdWUgPT09IDEpIHsgcmV0dXJuOyB9XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHZhbHVlID0gTWF0aC5yb3VuZCh2YWx1ZSAqIDEwMCk7XHJcblxyXG5cdFx0XHRpZiAoZmlsdGVyKSB7XHJcblx0XHRcdFx0ZmlsdGVyLkVuYWJsZWQgPSAodmFsdWUgIT09IDEwMCk7XHJcblx0XHRcdFx0ZmlsdGVyLk9wYWNpdHkgPSB2YWx1ZTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRlbC5zdHlsZS5maWx0ZXIgKz0gJyBwcm9naWQ6JyArIGZpbHRlck5hbWUgKyAnKG9wYWNpdHk9JyArIHZhbHVlICsgJyknO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0dGVzdFByb3A6IGZ1bmN0aW9uIChwcm9wcykge1xyXG5cclxuXHRcdHZhciBzdHlsZSA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZTtcclxuXHJcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHByb3BzLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRcdGlmIChwcm9wc1tpXSBpbiBzdHlsZSkge1xyXG5cdFx0XHRcdHJldHVybiBwcm9wc1tpXTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIGZhbHNlO1xyXG5cdH0sXHJcblxyXG5cdGdldFRyYW5zbGF0ZVN0cmluZzogZnVuY3Rpb24gKHBvaW50KSB7XHJcblx0XHQvLyBvbiBXZWJLaXQgYnJvd3NlcnMgKENocm9tZS9TYWZhcmkvaU9TIFNhZmFyaS9BbmRyb2lkKSB1c2luZyB0cmFuc2xhdGUzZCBpbnN0ZWFkIG9mIHRyYW5zbGF0ZVxyXG5cdFx0Ly8gbWFrZXMgYW5pbWF0aW9uIHNtb290aGVyIGFzIGl0IGVuc3VyZXMgSFcgYWNjZWwgaXMgdXNlZC4gRmlyZWZveCAxMyBkb2Vzbid0IGNhcmVcclxuXHRcdC8vIChzYW1lIHNwZWVkIGVpdGhlciB3YXkpLCBPcGVyYSAxMiBkb2Vzbid0IHN1cHBvcnQgdHJhbnNsYXRlM2RcclxuXHJcblx0XHR2YXIgaXMzZCA9IEwuQnJvd3Nlci53ZWJraXQzZCxcclxuXHRcdCAgICBvcGVuID0gJ3RyYW5zbGF0ZScgKyAoaXMzZCA/ICczZCcgOiAnJykgKyAnKCcsXHJcblx0XHQgICAgY2xvc2UgPSAoaXMzZCA/ICcsMCcgOiAnJykgKyAnKSc7XHJcblxyXG5cdFx0cmV0dXJuIG9wZW4gKyBwb2ludC54ICsgJ3B4LCcgKyBwb2ludC55ICsgJ3B4JyArIGNsb3NlO1xyXG5cdH0sXHJcblxyXG5cdGdldFNjYWxlU3RyaW5nOiBmdW5jdGlvbiAoc2NhbGUsIG9yaWdpbikge1xyXG5cclxuXHRcdHZhciBwcmVUcmFuc2xhdGVTdHIgPSBMLkRvbVV0aWwuZ2V0VHJhbnNsYXRlU3RyaW5nKG9yaWdpbi5hZGQob3JpZ2luLm11bHRpcGx5QnkoLTEgKiBzY2FsZSkpKSxcclxuXHRcdCAgICBzY2FsZVN0ciA9ICcgc2NhbGUoJyArIHNjYWxlICsgJykgJztcclxuXHJcblx0XHRyZXR1cm4gcHJlVHJhbnNsYXRlU3RyICsgc2NhbGVTdHI7XHJcblx0fSxcclxuXHJcblx0c2V0UG9zaXRpb246IGZ1bmN0aW9uIChlbCwgcG9pbnQsIGRpc2FibGUzRCkgeyAvLyAoSFRNTEVsZW1lbnQsIFBvaW50WywgQm9vbGVhbl0pXHJcblxyXG5cdFx0Ly8ganNoaW50IGNhbWVsY2FzZTogZmFsc2VcclxuXHRcdGVsLl9sZWFmbGV0X3BvcyA9IHBvaW50O1xyXG5cclxuXHRcdGlmICghZGlzYWJsZTNEICYmIEwuQnJvd3Nlci5hbnkzZCkge1xyXG5cdFx0XHRlbC5zdHlsZVtMLkRvbVV0aWwuVFJBTlNGT1JNXSA9ICBMLkRvbVV0aWwuZ2V0VHJhbnNsYXRlU3RyaW5nKHBvaW50KTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGVsLnN0eWxlLmxlZnQgPSBwb2ludC54ICsgJ3B4JztcclxuXHRcdFx0ZWwuc3R5bGUudG9wID0gcG9pbnQueSArICdweCc7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0Z2V0UG9zaXRpb246IGZ1bmN0aW9uIChlbCkge1xyXG5cdFx0Ly8gdGhpcyBtZXRob2QgaXMgb25seSB1c2VkIGZvciBlbGVtZW50cyBwcmV2aW91c2x5IHBvc2l0aW9uZWQgdXNpbmcgc2V0UG9zaXRpb24sXHJcblx0XHQvLyBzbyBpdCdzIHNhZmUgdG8gY2FjaGUgdGhlIHBvc2l0aW9uIGZvciBwZXJmb3JtYW5jZVxyXG5cclxuXHRcdC8vIGpzaGludCBjYW1lbGNhc2U6IGZhbHNlXHJcblx0XHRyZXR1cm4gZWwuX2xlYWZsZXRfcG9zO1xyXG5cdH1cclxufTtcclxuXHJcblxyXG4vLyBwcmVmaXggc3R5bGUgcHJvcGVydHkgbmFtZXNcclxuXHJcbkwuRG9tVXRpbC5UUkFOU0ZPUk0gPSBMLkRvbVV0aWwudGVzdFByb3AoXHJcbiAgICAgICAgWyd0cmFuc2Zvcm0nLCAnV2Via2l0VHJhbnNmb3JtJywgJ09UcmFuc2Zvcm0nLCAnTW96VHJhbnNmb3JtJywgJ21zVHJhbnNmb3JtJ10pO1xyXG5cclxuLy8gd2Via2l0VHJhbnNpdGlvbiBjb21lcyBmaXJzdCBiZWNhdXNlIHNvbWUgYnJvd3NlciB2ZXJzaW9ucyB0aGF0IGRyb3AgdmVuZG9yIHByZWZpeCBkb24ndCBkb1xyXG4vLyB0aGUgc2FtZSBmb3IgdGhlIHRyYW5zaXRpb25lbmQgZXZlbnQsIGluIHBhcnRpY3VsYXIgdGhlIEFuZHJvaWQgNC4xIHN0b2NrIGJyb3dzZXJcclxuXHJcbkwuRG9tVXRpbC5UUkFOU0lUSU9OID0gTC5Eb21VdGlsLnRlc3RQcm9wKFxyXG4gICAgICAgIFsnd2Via2l0VHJhbnNpdGlvbicsICd0cmFuc2l0aW9uJywgJ09UcmFuc2l0aW9uJywgJ01velRyYW5zaXRpb24nLCAnbXNUcmFuc2l0aW9uJ10pO1xyXG5cclxuTC5Eb21VdGlsLlRSQU5TSVRJT05fRU5EID1cclxuICAgICAgICBMLkRvbVV0aWwuVFJBTlNJVElPTiA9PT0gJ3dlYmtpdFRyYW5zaXRpb24nIHx8IEwuRG9tVXRpbC5UUkFOU0lUSU9OID09PSAnT1RyYW5zaXRpb24nID9cclxuICAgICAgICBMLkRvbVV0aWwuVFJBTlNJVElPTiArICdFbmQnIDogJ3RyYW5zaXRpb25lbmQnO1xyXG5cclxuKGZ1bmN0aW9uICgpIHtcclxuICAgIGlmICgnb25zZWxlY3RzdGFydCcgaW4gZG9jdW1lbnQpIHtcclxuICAgICAgICBMLmV4dGVuZChMLkRvbVV0aWwsIHtcclxuICAgICAgICAgICAgZGlzYWJsZVRleHRTZWxlY3Rpb246IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIEwuRG9tRXZlbnQub24od2luZG93LCAnc2VsZWN0c3RhcnQnLCBMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KTtcclxuICAgICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAgIGVuYWJsZVRleHRTZWxlY3Rpb246IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIEwuRG9tRXZlbnQub2ZmKHdpbmRvdywgJ3NlbGVjdHN0YXJ0JywgTC5Eb21FdmVudC5wcmV2ZW50RGVmYXVsdCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdmFyIHVzZXJTZWxlY3RQcm9wZXJ0eSA9IEwuRG9tVXRpbC50ZXN0UHJvcChcclxuICAgICAgICAgICAgWyd1c2VyU2VsZWN0JywgJ1dlYmtpdFVzZXJTZWxlY3QnLCAnT1VzZXJTZWxlY3QnLCAnTW96VXNlclNlbGVjdCcsICdtc1VzZXJTZWxlY3QnXSk7XHJcblxyXG4gICAgICAgIEwuZXh0ZW5kKEwuRG9tVXRpbCwge1xyXG4gICAgICAgICAgICBkaXNhYmxlVGV4dFNlbGVjdGlvbjogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHVzZXJTZWxlY3RQcm9wZXJ0eSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBzdHlsZSA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl91c2VyU2VsZWN0ID0gc3R5bGVbdXNlclNlbGVjdFByb3BlcnR5XTtcclxuICAgICAgICAgICAgICAgICAgICBzdHlsZVt1c2VyU2VsZWN0UHJvcGVydHldID0gJ25vbmUnO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgZW5hYmxlVGV4dFNlbGVjdGlvbjogZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHVzZXJTZWxlY3RQcm9wZXJ0eSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZVt1c2VyU2VsZWN0UHJvcGVydHldID0gdGhpcy5fdXNlclNlbGVjdDtcclxuICAgICAgICAgICAgICAgICAgICBkZWxldGUgdGhpcy5fdXNlclNlbGVjdDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuXHRMLmV4dGVuZChMLkRvbVV0aWwsIHtcclxuXHRcdGRpc2FibGVJbWFnZURyYWc6IGZ1bmN0aW9uICgpIHtcclxuXHRcdFx0TC5Eb21FdmVudC5vbih3aW5kb3csICdkcmFnc3RhcnQnLCBMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KTtcclxuXHRcdH0sXHJcblxyXG5cdFx0ZW5hYmxlSW1hZ2VEcmFnOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRcdEwuRG9tRXZlbnQub2ZmKHdpbmRvdywgJ2RyYWdzdGFydCcsIEwuRG9tRXZlbnQucHJldmVudERlZmF1bHQpO1xyXG5cdFx0fVxyXG5cdH0pO1xyXG59KSgpO1xyXG5cblxuLypcclxuICogTC5MYXRMbmcgcmVwcmVzZW50cyBhIGdlb2dyYXBoaWNhbCBwb2ludCB3aXRoIGxhdGl0dWRlIGFuZCBsb25naXR1ZGUgY29vcmRpbmF0ZXMuXHJcbiAqL1xyXG5cclxuTC5MYXRMbmcgPSBmdW5jdGlvbiAobGF0LCBsbmcsIGFsdCkgeyAvLyAoTnVtYmVyLCBOdW1iZXIsIE51bWJlcilcclxuXHRsYXQgPSBwYXJzZUZsb2F0KGxhdCk7XHJcblx0bG5nID0gcGFyc2VGbG9hdChsbmcpO1xyXG5cclxuXHRpZiAoaXNOYU4obGF0KSB8fCBpc05hTihsbmcpKSB7XHJcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgTGF0TG5nIG9iamVjdDogKCcgKyBsYXQgKyAnLCAnICsgbG5nICsgJyknKTtcclxuXHR9XHJcblxyXG5cdHRoaXMubGF0ID0gbGF0O1xyXG5cdHRoaXMubG5nID0gbG5nO1xyXG5cclxuXHRpZiAoYWx0ICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdHRoaXMuYWx0ID0gcGFyc2VGbG9hdChhbHQpO1xyXG5cdH1cclxufTtcclxuXHJcbkwuZXh0ZW5kKEwuTGF0TG5nLCB7XHJcblx0REVHX1RPX1JBRDogTWF0aC5QSSAvIDE4MCxcclxuXHRSQURfVE9fREVHOiAxODAgLyBNYXRoLlBJLFxyXG5cdE1BWF9NQVJHSU46IDEuMEUtOSAvLyBtYXggbWFyZ2luIG9mIGVycm9yIGZvciB0aGUgXCJlcXVhbHNcIiBjaGVja1xyXG59KTtcclxuXHJcbkwuTGF0TG5nLnByb3RvdHlwZSA9IHtcclxuXHRlcXVhbHM6IGZ1bmN0aW9uIChvYmopIHsgLy8gKExhdExuZykgLT4gQm9vbGVhblxyXG5cdFx0aWYgKCFvYmopIHsgcmV0dXJuIGZhbHNlOyB9XHJcblxyXG5cdFx0b2JqID0gTC5sYXRMbmcob2JqKTtcclxuXHJcblx0XHR2YXIgbWFyZ2luID0gTWF0aC5tYXgoXHJcblx0XHQgICAgICAgIE1hdGguYWJzKHRoaXMubGF0IC0gb2JqLmxhdCksXHJcblx0XHQgICAgICAgIE1hdGguYWJzKHRoaXMubG5nIC0gb2JqLmxuZykpO1xyXG5cclxuXHRcdHJldHVybiBtYXJnaW4gPD0gTC5MYXRMbmcuTUFYX01BUkdJTjtcclxuXHR9LFxyXG5cclxuXHR0b1N0cmluZzogZnVuY3Rpb24gKHByZWNpc2lvbikgeyAvLyAoTnVtYmVyKSAtPiBTdHJpbmdcclxuXHRcdHJldHVybiAnTGF0TG5nKCcgK1xyXG5cdFx0ICAgICAgICBMLlV0aWwuZm9ybWF0TnVtKHRoaXMubGF0LCBwcmVjaXNpb24pICsgJywgJyArXHJcblx0XHQgICAgICAgIEwuVXRpbC5mb3JtYXROdW0odGhpcy5sbmcsIHByZWNpc2lvbikgKyAnKSc7XHJcblx0fSxcclxuXHJcblx0Ly8gSGF2ZXJzaW5lIGRpc3RhbmNlIGZvcm11bGEsIHNlZSBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0hhdmVyc2luZV9mb3JtdWxhXHJcblx0Ly8gVE9ETyBtb3ZlIHRvIHByb2plY3Rpb24gY29kZSwgTGF0TG5nIHNob3VsZG4ndCBrbm93IGFib3V0IEVhcnRoXHJcblx0ZGlzdGFuY2VUbzogZnVuY3Rpb24gKG90aGVyKSB7IC8vIChMYXRMbmcpIC0+IE51bWJlclxyXG5cdFx0b3RoZXIgPSBMLmxhdExuZyhvdGhlcik7XHJcblxyXG5cdFx0dmFyIFIgPSA2Mzc4MTM3LCAvLyBlYXJ0aCByYWRpdXMgaW4gbWV0ZXJzXHJcblx0XHQgICAgZDJyID0gTC5MYXRMbmcuREVHX1RPX1JBRCxcclxuXHRcdCAgICBkTGF0ID0gKG90aGVyLmxhdCAtIHRoaXMubGF0KSAqIGQycixcclxuXHRcdCAgICBkTG9uID0gKG90aGVyLmxuZyAtIHRoaXMubG5nKSAqIGQycixcclxuXHRcdCAgICBsYXQxID0gdGhpcy5sYXQgKiBkMnIsXHJcblx0XHQgICAgbGF0MiA9IG90aGVyLmxhdCAqIGQycixcclxuXHRcdCAgICBzaW4xID0gTWF0aC5zaW4oZExhdCAvIDIpLFxyXG5cdFx0ICAgIHNpbjIgPSBNYXRoLnNpbihkTG9uIC8gMik7XHJcblxyXG5cdFx0dmFyIGEgPSBzaW4xICogc2luMSArIHNpbjIgKiBzaW4yICogTWF0aC5jb3MobGF0MSkgKiBNYXRoLmNvcyhsYXQyKTtcclxuXHJcblx0XHRyZXR1cm4gUiAqIDIgKiBNYXRoLmF0YW4yKE1hdGguc3FydChhKSwgTWF0aC5zcXJ0KDEgLSBhKSk7XHJcblx0fSxcclxuXHJcblx0d3JhcDogZnVuY3Rpb24gKGEsIGIpIHsgLy8gKE51bWJlciwgTnVtYmVyKSAtPiBMYXRMbmdcclxuXHRcdHZhciBsbmcgPSB0aGlzLmxuZztcclxuXHJcblx0XHRhID0gYSB8fCAtMTgwO1xyXG5cdFx0YiA9IGIgfHwgIDE4MDtcclxuXHJcblx0XHRsbmcgPSAobG5nICsgYikgJSAoYiAtIGEpICsgKGxuZyA8IGEgfHwgbG5nID09PSBiID8gYiA6IGEpO1xyXG5cclxuXHRcdHJldHVybiBuZXcgTC5MYXRMbmcodGhpcy5sYXQsIGxuZyk7XHJcblx0fVxyXG59O1xyXG5cclxuTC5sYXRMbmcgPSBmdW5jdGlvbiAoYSwgYikgeyAvLyAoTGF0TG5nKSBvciAoW051bWJlciwgTnVtYmVyXSkgb3IgKE51bWJlciwgTnVtYmVyKVxyXG5cdGlmIChhIGluc3RhbmNlb2YgTC5MYXRMbmcpIHtcclxuXHRcdHJldHVybiBhO1xyXG5cdH1cclxuXHRpZiAoTC5VdGlsLmlzQXJyYXkoYSkpIHtcclxuXHRcdGlmICh0eXBlb2YgYVswXSA9PT0gJ251bWJlcicgfHwgdHlwZW9mIGFbMF0gPT09ICdzdHJpbmcnKSB7XHJcblx0XHRcdHJldHVybiBuZXcgTC5MYXRMbmcoYVswXSwgYVsxXSwgYVsyXSk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRyZXR1cm4gbnVsbDtcclxuXHRcdH1cclxuXHR9XHJcblx0aWYgKGEgPT09IHVuZGVmaW5lZCB8fCBhID09PSBudWxsKSB7XHJcblx0XHRyZXR1cm4gYTtcclxuXHR9XHJcblx0aWYgKHR5cGVvZiBhID09PSAnb2JqZWN0JyAmJiAnbGF0JyBpbiBhKSB7XHJcblx0XHRyZXR1cm4gbmV3IEwuTGF0TG5nKGEubGF0LCAnbG5nJyBpbiBhID8gYS5sbmcgOiBhLmxvbik7XHJcblx0fVxyXG5cdGlmIChiID09PSB1bmRlZmluZWQpIHtcclxuXHRcdHJldHVybiBudWxsO1xyXG5cdH1cclxuXHRyZXR1cm4gbmV3IEwuTGF0TG5nKGEsIGIpO1xyXG59O1xyXG5cclxuXG5cbi8qXHJcbiAqIEwuTGF0TG5nQm91bmRzIHJlcHJlc2VudHMgYSByZWN0YW5ndWxhciBhcmVhIG9uIHRoZSBtYXAgaW4gZ2VvZ3JhcGhpY2FsIGNvb3JkaW5hdGVzLlxyXG4gKi9cclxuXHJcbkwuTGF0TG5nQm91bmRzID0gZnVuY3Rpb24gKHNvdXRoV2VzdCwgbm9ydGhFYXN0KSB7IC8vIChMYXRMbmcsIExhdExuZykgb3IgKExhdExuZ1tdKVxyXG5cdGlmICghc291dGhXZXN0KSB7IHJldHVybjsgfVxyXG5cclxuXHR2YXIgbGF0bG5ncyA9IG5vcnRoRWFzdCA/IFtzb3V0aFdlc3QsIG5vcnRoRWFzdF0gOiBzb3V0aFdlc3Q7XHJcblxyXG5cdGZvciAodmFyIGkgPSAwLCBsZW4gPSBsYXRsbmdzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHR0aGlzLmV4dGVuZChsYXRsbmdzW2ldKTtcclxuXHR9XHJcbn07XHJcblxyXG5MLkxhdExuZ0JvdW5kcy5wcm90b3R5cGUgPSB7XHJcblx0Ly8gZXh0ZW5kIHRoZSBib3VuZHMgdG8gY29udGFpbiB0aGUgZ2l2ZW4gcG9pbnQgb3IgYm91bmRzXHJcblx0ZXh0ZW5kOiBmdW5jdGlvbiAob2JqKSB7IC8vIChMYXRMbmcpIG9yIChMYXRMbmdCb3VuZHMpXHJcblx0XHRpZiAoIW9iaikgeyByZXR1cm4gdGhpczsgfVxyXG5cclxuXHRcdHZhciBsYXRMbmcgPSBMLmxhdExuZyhvYmopO1xyXG5cdFx0aWYgKGxhdExuZyAhPT0gbnVsbCkge1xyXG5cdFx0XHRvYmogPSBsYXRMbmc7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRvYmogPSBMLmxhdExuZ0JvdW5kcyhvYmopO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChvYmogaW5zdGFuY2VvZiBMLkxhdExuZykge1xyXG5cdFx0XHRpZiAoIXRoaXMuX3NvdXRoV2VzdCAmJiAhdGhpcy5fbm9ydGhFYXN0KSB7XHJcblx0XHRcdFx0dGhpcy5fc291dGhXZXN0ID0gbmV3IEwuTGF0TG5nKG9iai5sYXQsIG9iai5sbmcpO1xyXG5cdFx0XHRcdHRoaXMuX25vcnRoRWFzdCA9IG5ldyBMLkxhdExuZyhvYmoubGF0LCBvYmoubG5nKTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHR0aGlzLl9zb3V0aFdlc3QubGF0ID0gTWF0aC5taW4ob2JqLmxhdCwgdGhpcy5fc291dGhXZXN0LmxhdCk7XHJcblx0XHRcdFx0dGhpcy5fc291dGhXZXN0LmxuZyA9IE1hdGgubWluKG9iai5sbmcsIHRoaXMuX3NvdXRoV2VzdC5sbmcpO1xyXG5cclxuXHRcdFx0XHR0aGlzLl9ub3J0aEVhc3QubGF0ID0gTWF0aC5tYXgob2JqLmxhdCwgdGhpcy5fbm9ydGhFYXN0LmxhdCk7XHJcblx0XHRcdFx0dGhpcy5fbm9ydGhFYXN0LmxuZyA9IE1hdGgubWF4KG9iai5sbmcsIHRoaXMuX25vcnRoRWFzdC5sbmcpO1xyXG5cdFx0XHR9XHJcblx0XHR9IGVsc2UgaWYgKG9iaiBpbnN0YW5jZW9mIEwuTGF0TG5nQm91bmRzKSB7XHJcblx0XHRcdHRoaXMuZXh0ZW5kKG9iai5fc291dGhXZXN0KTtcclxuXHRcdFx0dGhpcy5leHRlbmQob2JqLl9ub3J0aEVhc3QpO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0Ly8gZXh0ZW5kIHRoZSBib3VuZHMgYnkgYSBwZXJjZW50YWdlXHJcblx0cGFkOiBmdW5jdGlvbiAoYnVmZmVyUmF0aW8pIHsgLy8gKE51bWJlcikgLT4gTGF0TG5nQm91bmRzXHJcblx0XHR2YXIgc3cgPSB0aGlzLl9zb3V0aFdlc3QsXHJcblx0XHQgICAgbmUgPSB0aGlzLl9ub3J0aEVhc3QsXHJcblx0XHQgICAgaGVpZ2h0QnVmZmVyID0gTWF0aC5hYnMoc3cubGF0IC0gbmUubGF0KSAqIGJ1ZmZlclJhdGlvLFxyXG5cdFx0ICAgIHdpZHRoQnVmZmVyID0gTWF0aC5hYnMoc3cubG5nIC0gbmUubG5nKSAqIGJ1ZmZlclJhdGlvO1xyXG5cclxuXHRcdHJldHVybiBuZXcgTC5MYXRMbmdCb3VuZHMoXHJcblx0XHQgICAgICAgIG5ldyBMLkxhdExuZyhzdy5sYXQgLSBoZWlnaHRCdWZmZXIsIHN3LmxuZyAtIHdpZHRoQnVmZmVyKSxcclxuXHRcdCAgICAgICAgbmV3IEwuTGF0TG5nKG5lLmxhdCArIGhlaWdodEJ1ZmZlciwgbmUubG5nICsgd2lkdGhCdWZmZXIpKTtcclxuXHR9LFxyXG5cclxuXHRnZXRDZW50ZXI6IGZ1bmN0aW9uICgpIHsgLy8gLT4gTGF0TG5nXHJcblx0XHRyZXR1cm4gbmV3IEwuTGF0TG5nKFxyXG5cdFx0ICAgICAgICAodGhpcy5fc291dGhXZXN0LmxhdCArIHRoaXMuX25vcnRoRWFzdC5sYXQpIC8gMixcclxuXHRcdCAgICAgICAgKHRoaXMuX3NvdXRoV2VzdC5sbmcgKyB0aGlzLl9ub3J0aEVhc3QubG5nKSAvIDIpO1xyXG5cdH0sXHJcblxyXG5cdGdldFNvdXRoV2VzdDogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX3NvdXRoV2VzdDtcclxuXHR9LFxyXG5cclxuXHRnZXROb3J0aEVhc3Q6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9ub3J0aEVhc3Q7XHJcblx0fSxcclxuXHJcblx0Z2V0Tm9ydGhXZXN0OiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gbmV3IEwuTGF0TG5nKHRoaXMuZ2V0Tm9ydGgoKSwgdGhpcy5nZXRXZXN0KCkpO1xyXG5cdH0sXHJcblxyXG5cdGdldFNvdXRoRWFzdDogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIG5ldyBMLkxhdExuZyh0aGlzLmdldFNvdXRoKCksIHRoaXMuZ2V0RWFzdCgpKTtcclxuXHR9LFxyXG5cclxuXHRnZXRXZXN0OiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fc291dGhXZXN0LmxuZztcclxuXHR9LFxyXG5cclxuXHRnZXRTb3V0aDogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX3NvdXRoV2VzdC5sYXQ7XHJcblx0fSxcclxuXHJcblx0Z2V0RWFzdDogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX25vcnRoRWFzdC5sbmc7XHJcblx0fSxcclxuXHJcblx0Z2V0Tm9ydGg6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9ub3J0aEVhc3QubGF0O1xyXG5cdH0sXHJcblxyXG5cdGNvbnRhaW5zOiBmdW5jdGlvbiAob2JqKSB7IC8vIChMYXRMbmdCb3VuZHMpIG9yIChMYXRMbmcpIC0+IEJvb2xlYW5cclxuXHRcdGlmICh0eXBlb2Ygb2JqWzBdID09PSAnbnVtYmVyJyB8fCBvYmogaW5zdGFuY2VvZiBMLkxhdExuZykge1xyXG5cdFx0XHRvYmogPSBMLmxhdExuZyhvYmopO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0b2JqID0gTC5sYXRMbmdCb3VuZHMob2JqKTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgc3cgPSB0aGlzLl9zb3V0aFdlc3QsXHJcblx0XHQgICAgbmUgPSB0aGlzLl9ub3J0aEVhc3QsXHJcblx0XHQgICAgc3cyLCBuZTI7XHJcblxyXG5cdFx0aWYgKG9iaiBpbnN0YW5jZW9mIEwuTGF0TG5nQm91bmRzKSB7XHJcblx0XHRcdHN3MiA9IG9iai5nZXRTb3V0aFdlc3QoKTtcclxuXHRcdFx0bmUyID0gb2JqLmdldE5vcnRoRWFzdCgpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0c3cyID0gbmUyID0gb2JqO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiAoc3cyLmxhdCA+PSBzdy5sYXQpICYmIChuZTIubGF0IDw9IG5lLmxhdCkgJiZcclxuXHRcdCAgICAgICAoc3cyLmxuZyA+PSBzdy5sbmcpICYmIChuZTIubG5nIDw9IG5lLmxuZyk7XHJcblx0fSxcclxuXHJcblx0aW50ZXJzZWN0czogZnVuY3Rpb24gKGJvdW5kcykgeyAvLyAoTGF0TG5nQm91bmRzKVxyXG5cdFx0Ym91bmRzID0gTC5sYXRMbmdCb3VuZHMoYm91bmRzKTtcclxuXHJcblx0XHR2YXIgc3cgPSB0aGlzLl9zb3V0aFdlc3QsXHJcblx0XHQgICAgbmUgPSB0aGlzLl9ub3J0aEVhc3QsXHJcblx0XHQgICAgc3cyID0gYm91bmRzLmdldFNvdXRoV2VzdCgpLFxyXG5cdFx0ICAgIG5lMiA9IGJvdW5kcy5nZXROb3J0aEVhc3QoKSxcclxuXHJcblx0XHQgICAgbGF0SW50ZXJzZWN0cyA9IChuZTIubGF0ID49IHN3LmxhdCkgJiYgKHN3Mi5sYXQgPD0gbmUubGF0KSxcclxuXHRcdCAgICBsbmdJbnRlcnNlY3RzID0gKG5lMi5sbmcgPj0gc3cubG5nKSAmJiAoc3cyLmxuZyA8PSBuZS5sbmcpO1xyXG5cclxuXHRcdHJldHVybiBsYXRJbnRlcnNlY3RzICYmIGxuZ0ludGVyc2VjdHM7XHJcblx0fSxcclxuXHJcblx0dG9CQm94U3RyaW5nOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gW3RoaXMuZ2V0V2VzdCgpLCB0aGlzLmdldFNvdXRoKCksIHRoaXMuZ2V0RWFzdCgpLCB0aGlzLmdldE5vcnRoKCldLmpvaW4oJywnKTtcclxuXHR9LFxyXG5cclxuXHRlcXVhbHM6IGZ1bmN0aW9uIChib3VuZHMpIHsgLy8gKExhdExuZ0JvdW5kcylcclxuXHRcdGlmICghYm91bmRzKSB7IHJldHVybiBmYWxzZTsgfVxyXG5cclxuXHRcdGJvdW5kcyA9IEwubGF0TG5nQm91bmRzKGJvdW5kcyk7XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuX3NvdXRoV2VzdC5lcXVhbHMoYm91bmRzLmdldFNvdXRoV2VzdCgpKSAmJlxyXG5cdFx0ICAgICAgIHRoaXMuX25vcnRoRWFzdC5lcXVhbHMoYm91bmRzLmdldE5vcnRoRWFzdCgpKTtcclxuXHR9LFxyXG5cclxuXHRpc1ZhbGlkOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gISEodGhpcy5fc291dGhXZXN0ICYmIHRoaXMuX25vcnRoRWFzdCk7XHJcblx0fVxyXG59O1xyXG5cclxuLy9UT0RPIEludGVybmF0aW9uYWwgZGF0ZSBsaW5lP1xyXG5cclxuTC5sYXRMbmdCb3VuZHMgPSBmdW5jdGlvbiAoYSwgYikgeyAvLyAoTGF0TG5nQm91bmRzKSBvciAoTGF0TG5nLCBMYXRMbmcpXHJcblx0aWYgKCFhIHx8IGEgaW5zdGFuY2VvZiBMLkxhdExuZ0JvdW5kcykge1xyXG5cdFx0cmV0dXJuIGE7XHJcblx0fVxyXG5cdHJldHVybiBuZXcgTC5MYXRMbmdCb3VuZHMoYSwgYik7XHJcbn07XHJcblxuXG4vKlxyXG4gKiBMLlByb2plY3Rpb24gY29udGFpbnMgdmFyaW91cyBnZW9ncmFwaGljYWwgcHJvamVjdGlvbnMgdXNlZCBieSBDUlMgY2xhc3Nlcy5cclxuICovXHJcblxyXG5MLlByb2plY3Rpb24gPSB7fTtcclxuXG5cbi8qXHJcbiAqIFNwaGVyaWNhbCBNZXJjYXRvciBpcyB0aGUgbW9zdCBwb3B1bGFyIG1hcCBwcm9qZWN0aW9uLCB1c2VkIGJ5IEVQU0c6Mzg1NyBDUlMgdXNlZCBieSBkZWZhdWx0LlxyXG4gKi9cclxuXHJcbkwuUHJvamVjdGlvbi5TcGhlcmljYWxNZXJjYXRvciA9IHtcclxuXHRNQVhfTEFUSVRVREU6IDg1LjA1MTEyODc3OTgsXHJcblxyXG5cdHByb2plY3Q6IGZ1bmN0aW9uIChsYXRsbmcpIHsgLy8gKExhdExuZykgLT4gUG9pbnRcclxuXHRcdHZhciBkID0gTC5MYXRMbmcuREVHX1RPX1JBRCxcclxuXHRcdCAgICBtYXggPSB0aGlzLk1BWF9MQVRJVFVERSxcclxuXHRcdCAgICBsYXQgPSBNYXRoLm1heChNYXRoLm1pbihtYXgsIGxhdGxuZy5sYXQpLCAtbWF4KSxcclxuXHRcdCAgICB4ID0gbGF0bG5nLmxuZyAqIGQsXHJcblx0XHQgICAgeSA9IGxhdCAqIGQ7XHJcblxyXG5cdFx0eSA9IE1hdGgubG9nKE1hdGgudGFuKChNYXRoLlBJIC8gNCkgKyAoeSAvIDIpKSk7XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBMLlBvaW50KHgsIHkpO1xyXG5cdH0sXHJcblxyXG5cdHVucHJvamVjdDogZnVuY3Rpb24gKHBvaW50KSB7IC8vIChQb2ludCwgQm9vbGVhbikgLT4gTGF0TG5nXHJcblx0XHR2YXIgZCA9IEwuTGF0TG5nLlJBRF9UT19ERUcsXHJcblx0XHQgICAgbG5nID0gcG9pbnQueCAqIGQsXHJcblx0XHQgICAgbGF0ID0gKDIgKiBNYXRoLmF0YW4oTWF0aC5leHAocG9pbnQueSkpIC0gKE1hdGguUEkgLyAyKSkgKiBkO1xyXG5cclxuXHRcdHJldHVybiBuZXcgTC5MYXRMbmcobGF0LCBsbmcpO1xyXG5cdH1cclxufTtcclxuXG5cbi8qXHJcbiAqIFNpbXBsZSBlcXVpcmVjdGFuZ3VsYXIgKFBsYXRlIENhcnJlZSkgcHJvamVjdGlvbiwgdXNlZCBieSBDUlMgbGlrZSBFUFNHOjQzMjYgYW5kIFNpbXBsZS5cclxuICovXHJcblxyXG5MLlByb2plY3Rpb24uTG9uTGF0ID0ge1xyXG5cdHByb2plY3Q6IGZ1bmN0aW9uIChsYXRsbmcpIHtcclxuXHRcdHJldHVybiBuZXcgTC5Qb2ludChsYXRsbmcubG5nLCBsYXRsbmcubGF0KTtcclxuXHR9LFxyXG5cclxuXHR1bnByb2plY3Q6IGZ1bmN0aW9uIChwb2ludCkge1xyXG5cdFx0cmV0dXJuIG5ldyBMLkxhdExuZyhwb2ludC55LCBwb2ludC54KTtcclxuXHR9XHJcbn07XHJcblxuXG4vKlxyXG4gKiBMLkNSUyBpcyBhIGJhc2Ugb2JqZWN0IGZvciBhbGwgZGVmaW5lZCBDUlMgKENvb3JkaW5hdGUgUmVmZXJlbmNlIFN5c3RlbXMpIGluIExlYWZsZXQuXHJcbiAqL1xyXG5cclxuTC5DUlMgPSB7XHJcblx0bGF0TG5nVG9Qb2ludDogZnVuY3Rpb24gKGxhdGxuZywgem9vbSkgeyAvLyAoTGF0TG5nLCBOdW1iZXIpIC0+IFBvaW50XHJcblx0XHR2YXIgcHJvamVjdGVkUG9pbnQgPSB0aGlzLnByb2plY3Rpb24ucHJvamVjdChsYXRsbmcpLFxyXG5cdFx0ICAgIHNjYWxlID0gdGhpcy5zY2FsZSh6b29tKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpcy50cmFuc2Zvcm1hdGlvbi5fdHJhbnNmb3JtKHByb2plY3RlZFBvaW50LCBzY2FsZSk7XHJcblx0fSxcclxuXHJcblx0cG9pbnRUb0xhdExuZzogZnVuY3Rpb24gKHBvaW50LCB6b29tKSB7IC8vIChQb2ludCwgTnVtYmVyWywgQm9vbGVhbl0pIC0+IExhdExuZ1xyXG5cdFx0dmFyIHNjYWxlID0gdGhpcy5zY2FsZSh6b29tKSxcclxuXHRcdCAgICB1bnRyYW5zZm9ybWVkUG9pbnQgPSB0aGlzLnRyYW5zZm9ybWF0aW9uLnVudHJhbnNmb3JtKHBvaW50LCBzY2FsZSk7XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMucHJvamVjdGlvbi51bnByb2plY3QodW50cmFuc2Zvcm1lZFBvaW50KTtcclxuXHR9LFxyXG5cclxuXHRwcm9qZWN0OiBmdW5jdGlvbiAobGF0bG5nKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5wcm9qZWN0aW9uLnByb2plY3QobGF0bG5nKTtcclxuXHR9LFxyXG5cclxuXHRzY2FsZTogZnVuY3Rpb24gKHpvb20pIHtcclxuXHRcdHJldHVybiAyNTYgKiBNYXRoLnBvdygyLCB6b29tKTtcclxuXHR9LFxyXG5cclxuXHRnZXRTaXplOiBmdW5jdGlvbiAoem9vbSkge1xyXG5cdFx0dmFyIHMgPSB0aGlzLnNjYWxlKHpvb20pO1xyXG5cdFx0cmV0dXJuIEwucG9pbnQocywgcyk7XHJcblx0fVxyXG59O1xyXG5cblxuLypcbiAqIEEgc2ltcGxlIENSUyB0aGF0IGNhbiBiZSB1c2VkIGZvciBmbGF0IG5vbi1FYXJ0aCBtYXBzIGxpa2UgcGFub3JhbWFzIG9yIGdhbWUgbWFwcy5cbiAqL1xuXG5MLkNSUy5TaW1wbGUgPSBMLmV4dGVuZCh7fSwgTC5DUlMsIHtcblx0cHJvamVjdGlvbjogTC5Qcm9qZWN0aW9uLkxvbkxhdCxcblx0dHJhbnNmb3JtYXRpb246IG5ldyBMLlRyYW5zZm9ybWF0aW9uKDEsIDAsIC0xLCAwKSxcblxuXHRzY2FsZTogZnVuY3Rpb24gKHpvb20pIHtcblx0XHRyZXR1cm4gTWF0aC5wb3coMiwgem9vbSk7XG5cdH1cbn0pO1xuXG5cbi8qXHJcbiAqIEwuQ1JTLkVQU0czODU3IChTcGhlcmljYWwgTWVyY2F0b3IpIGlzIHRoZSBtb3N0IGNvbW1vbiBDUlMgZm9yIHdlYiBtYXBwaW5nXHJcbiAqIGFuZCBpcyB1c2VkIGJ5IExlYWZsZXQgYnkgZGVmYXVsdC5cclxuICovXHJcblxyXG5MLkNSUy5FUFNHMzg1NyA9IEwuZXh0ZW5kKHt9LCBMLkNSUywge1xyXG5cdGNvZGU6ICdFUFNHOjM4NTcnLFxyXG5cclxuXHRwcm9qZWN0aW9uOiBMLlByb2plY3Rpb24uU3BoZXJpY2FsTWVyY2F0b3IsXHJcblx0dHJhbnNmb3JtYXRpb246IG5ldyBMLlRyYW5zZm9ybWF0aW9uKDAuNSAvIE1hdGguUEksIDAuNSwgLTAuNSAvIE1hdGguUEksIDAuNSksXHJcblxyXG5cdHByb2plY3Q6IGZ1bmN0aW9uIChsYXRsbmcpIHsgLy8gKExhdExuZykgLT4gUG9pbnRcclxuXHRcdHZhciBwcm9qZWN0ZWRQb2ludCA9IHRoaXMucHJvamVjdGlvbi5wcm9qZWN0KGxhdGxuZyksXHJcblx0XHQgICAgZWFydGhSYWRpdXMgPSA2Mzc4MTM3O1xyXG5cdFx0cmV0dXJuIHByb2plY3RlZFBvaW50Lm11bHRpcGx5QnkoZWFydGhSYWRpdXMpO1xyXG5cdH1cclxufSk7XHJcblxyXG5MLkNSUy5FUFNHOTAwOTEzID0gTC5leHRlbmQoe30sIEwuQ1JTLkVQU0czODU3LCB7XHJcblx0Y29kZTogJ0VQU0c6OTAwOTEzJ1xyXG59KTtcclxuXG5cbi8qXHJcbiAqIEwuQ1JTLkVQU0c0MzI2IGlzIGEgQ1JTIHBvcHVsYXIgYW1vbmcgYWR2YW5jZWQgR0lTIHNwZWNpYWxpc3RzLlxyXG4gKi9cclxuXHJcbkwuQ1JTLkVQU0c0MzI2ID0gTC5leHRlbmQoe30sIEwuQ1JTLCB7XHJcblx0Y29kZTogJ0VQU0c6NDMyNicsXHJcblxyXG5cdHByb2plY3Rpb246IEwuUHJvamVjdGlvbi5Mb25MYXQsXHJcblx0dHJhbnNmb3JtYXRpb246IG5ldyBMLlRyYW5zZm9ybWF0aW9uKDEgLyAzNjAsIDAuNSwgLTEgLyAzNjAsIDAuNSlcclxufSk7XHJcblxuXG4vKlxyXG4gKiBMLk1hcCBpcyB0aGUgY2VudHJhbCBjbGFzcyBvZiB0aGUgQVBJIC0gaXQgaXMgdXNlZCB0byBjcmVhdGUgYSBtYXAuXHJcbiAqL1xyXG5cclxuTC5NYXAgPSBMLkNsYXNzLmV4dGVuZCh7XHJcblxyXG5cdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcclxuXHJcblx0b3B0aW9uczoge1xyXG5cdFx0Y3JzOiBMLkNSUy5FUFNHMzg1NyxcclxuXHJcblx0XHQvKlxyXG5cdFx0Y2VudGVyOiBMYXRMbmcsXHJcblx0XHR6b29tOiBOdW1iZXIsXHJcblx0XHRsYXllcnM6IEFycmF5LFxyXG5cdFx0Ki9cclxuXHJcblx0XHRmYWRlQW5pbWF0aW9uOiBMLkRvbVV0aWwuVFJBTlNJVElPTiAmJiAhTC5Ccm93c2VyLmFuZHJvaWQyMyxcclxuXHRcdHRyYWNrUmVzaXplOiB0cnVlLFxyXG5cdFx0bWFya2VyWm9vbUFuaW1hdGlvbjogTC5Eb21VdGlsLlRSQU5TSVRJT04gJiYgTC5Ccm93c2VyLmFueTNkXHJcblx0fSxcclxuXHJcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKGlkLCBvcHRpb25zKSB7IC8vIChIVE1MRWxlbWVudCBvciBTdHJpbmcsIE9iamVjdClcclxuXHRcdG9wdGlvbnMgPSBMLnNldE9wdGlvbnModGhpcywgb3B0aW9ucyk7XHJcblxyXG5cclxuXHRcdHRoaXMuX2luaXRDb250YWluZXIoaWQpO1xyXG5cdFx0dGhpcy5faW5pdExheW91dCgpO1xyXG5cclxuXHRcdC8vIGhhY2sgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9MZWFmbGV0L0xlYWZsZXQvaXNzdWVzLzE5ODBcclxuXHRcdHRoaXMuX29uUmVzaXplID0gTC5iaW5kKHRoaXMuX29uUmVzaXplLCB0aGlzKTtcclxuXHJcblx0XHR0aGlzLl9pbml0RXZlbnRzKCk7XHJcblxyXG5cdFx0aWYgKG9wdGlvbnMubWF4Qm91bmRzKSB7XHJcblx0XHRcdHRoaXMuc2V0TWF4Qm91bmRzKG9wdGlvbnMubWF4Qm91bmRzKTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAob3B0aW9ucy5jZW50ZXIgJiYgb3B0aW9ucy56b29tICE9PSB1bmRlZmluZWQpIHtcclxuXHRcdFx0dGhpcy5zZXRWaWV3KEwubGF0TG5nKG9wdGlvbnMuY2VudGVyKSwgb3B0aW9ucy56b29tLCB7cmVzZXQ6IHRydWV9KTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9oYW5kbGVycyA9IFtdO1xyXG5cclxuXHRcdHRoaXMuX2xheWVycyA9IHt9O1xyXG5cdFx0dGhpcy5fem9vbUJvdW5kTGF5ZXJzID0ge307XHJcblx0XHR0aGlzLl90aWxlTGF5ZXJzTnVtID0gMDtcclxuXHJcblx0XHR0aGlzLmNhbGxJbml0SG9va3MoKTtcclxuXHJcblx0XHR0aGlzLl9hZGRMYXllcnMob3B0aW9ucy5sYXllcnMpO1xyXG5cdH0sXHJcblxyXG5cclxuXHQvLyBwdWJsaWMgbWV0aG9kcyB0aGF0IG1vZGlmeSBtYXAgc3RhdGVcclxuXHJcblx0Ly8gcmVwbGFjZWQgYnkgYW5pbWF0aW9uLXBvd2VyZWQgaW1wbGVtZW50YXRpb24gaW4gTWFwLlBhbkFuaW1hdGlvbi5qc1xyXG5cdHNldFZpZXc6IGZ1bmN0aW9uIChjZW50ZXIsIHpvb20pIHtcclxuXHRcdHpvb20gPSB6b29tID09PSB1bmRlZmluZWQgPyB0aGlzLmdldFpvb20oKSA6IHpvb207XHJcblx0XHR0aGlzLl9yZXNldFZpZXcoTC5sYXRMbmcoY2VudGVyKSwgdGhpcy5fbGltaXRab29tKHpvb20pKTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHNldFpvb206IGZ1bmN0aW9uICh6b29tLCBvcHRpb25zKSB7XHJcblx0XHRpZiAoIXRoaXMuX2xvYWRlZCkge1xyXG5cdFx0XHR0aGlzLl96b29tID0gdGhpcy5fbGltaXRab29tKHpvb20pO1xyXG5cdFx0XHRyZXR1cm4gdGhpcztcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzLnNldFZpZXcodGhpcy5nZXRDZW50ZXIoKSwgem9vbSwge3pvb206IG9wdGlvbnN9KTtcclxuXHR9LFxyXG5cclxuXHR6b29tSW46IGZ1bmN0aW9uIChkZWx0YSwgb3B0aW9ucykge1xyXG5cdFx0cmV0dXJuIHRoaXMuc2V0Wm9vbSh0aGlzLl96b29tICsgKGRlbHRhIHx8IDEpLCBvcHRpb25zKTtcclxuXHR9LFxyXG5cclxuXHR6b29tT3V0OiBmdW5jdGlvbiAoZGVsdGEsIG9wdGlvbnMpIHtcclxuXHRcdHJldHVybiB0aGlzLnNldFpvb20odGhpcy5fem9vbSAtIChkZWx0YSB8fCAxKSwgb3B0aW9ucyk7XHJcblx0fSxcclxuXHJcblx0c2V0Wm9vbUFyb3VuZDogZnVuY3Rpb24gKGxhdGxuZywgem9vbSwgb3B0aW9ucykge1xyXG5cdFx0dmFyIHNjYWxlID0gdGhpcy5nZXRab29tU2NhbGUoem9vbSksXHJcblx0XHQgICAgdmlld0hhbGYgPSB0aGlzLmdldFNpemUoKS5kaXZpZGVCeSgyKSxcclxuXHRcdCAgICBjb250YWluZXJQb2ludCA9IGxhdGxuZyBpbnN0YW5jZW9mIEwuUG9pbnQgPyBsYXRsbmcgOiB0aGlzLmxhdExuZ1RvQ29udGFpbmVyUG9pbnQobGF0bG5nKSxcclxuXHJcblx0XHQgICAgY2VudGVyT2Zmc2V0ID0gY29udGFpbmVyUG9pbnQuc3VidHJhY3Qodmlld0hhbGYpLm11bHRpcGx5QnkoMSAtIDEgLyBzY2FsZSksXHJcblx0XHQgICAgbmV3Q2VudGVyID0gdGhpcy5jb250YWluZXJQb2ludFRvTGF0TG5nKHZpZXdIYWxmLmFkZChjZW50ZXJPZmZzZXQpKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpcy5zZXRWaWV3KG5ld0NlbnRlciwgem9vbSwge3pvb206IG9wdGlvbnN9KTtcclxuXHR9LFxyXG5cclxuXHRmaXRCb3VuZHM6IGZ1bmN0aW9uIChib3VuZHMsIG9wdGlvbnMpIHtcclxuXHJcblx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcclxuXHRcdGJvdW5kcyA9IGJvdW5kcy5nZXRCb3VuZHMgPyBib3VuZHMuZ2V0Qm91bmRzKCkgOiBMLmxhdExuZ0JvdW5kcyhib3VuZHMpO1xyXG5cclxuXHRcdHZhciBwYWRkaW5nVEwgPSBMLnBvaW50KG9wdGlvbnMucGFkZGluZ1RvcExlZnQgfHwgb3B0aW9ucy5wYWRkaW5nIHx8IFswLCAwXSksXHJcblx0XHQgICAgcGFkZGluZ0JSID0gTC5wb2ludChvcHRpb25zLnBhZGRpbmdCb3R0b21SaWdodCB8fCBvcHRpb25zLnBhZGRpbmcgfHwgWzAsIDBdKSxcclxuXHJcblx0XHQgICAgem9vbSA9IHRoaXMuZ2V0Qm91bmRzWm9vbShib3VuZHMsIGZhbHNlLCBwYWRkaW5nVEwuYWRkKHBhZGRpbmdCUikpLFxyXG5cdFx0ICAgIHBhZGRpbmdPZmZzZXQgPSBwYWRkaW5nQlIuc3VidHJhY3QocGFkZGluZ1RMKS5kaXZpZGVCeSgyKSxcclxuXHJcblx0XHQgICAgc3dQb2ludCA9IHRoaXMucHJvamVjdChib3VuZHMuZ2V0U291dGhXZXN0KCksIHpvb20pLFxyXG5cdFx0ICAgIG5lUG9pbnQgPSB0aGlzLnByb2plY3QoYm91bmRzLmdldE5vcnRoRWFzdCgpLCB6b29tKSxcclxuXHRcdCAgICBjZW50ZXIgPSB0aGlzLnVucHJvamVjdChzd1BvaW50LmFkZChuZVBvaW50KS5kaXZpZGVCeSgyKS5hZGQocGFkZGluZ09mZnNldCksIHpvb20pO1xyXG5cclxuXHRcdHpvb20gPSBvcHRpb25zICYmIG9wdGlvbnMubWF4Wm9vbSA/IE1hdGgubWluKG9wdGlvbnMubWF4Wm9vbSwgem9vbSkgOiB6b29tO1xyXG5cclxuXHRcdHJldHVybiB0aGlzLnNldFZpZXcoY2VudGVyLCB6b29tLCBvcHRpb25zKTtcclxuXHR9LFxyXG5cclxuXHRmaXRXb3JsZDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcclxuXHRcdHJldHVybiB0aGlzLmZpdEJvdW5kcyhbWy05MCwgLTE4MF0sIFs5MCwgMTgwXV0sIG9wdGlvbnMpO1xyXG5cdH0sXHJcblxyXG5cdHBhblRvOiBmdW5jdGlvbiAoY2VudGVyLCBvcHRpb25zKSB7IC8vIChMYXRMbmcpXHJcblx0XHRyZXR1cm4gdGhpcy5zZXRWaWV3KGNlbnRlciwgdGhpcy5fem9vbSwge3Bhbjogb3B0aW9uc30pO1xyXG5cdH0sXHJcblxyXG5cdHBhbkJ5OiBmdW5jdGlvbiAob2Zmc2V0KSB7IC8vIChQb2ludClcclxuXHRcdC8vIHJlcGxhY2VkIHdpdGggYW5pbWF0ZWQgcGFuQnkgaW4gTWFwLlBhbkFuaW1hdGlvbi5qc1xyXG5cdFx0dGhpcy5maXJlKCdtb3Zlc3RhcnQnKTtcclxuXHJcblx0XHR0aGlzLl9yYXdQYW5CeShMLnBvaW50KG9mZnNldCkpO1xyXG5cclxuXHRcdHRoaXMuZmlyZSgnbW92ZScpO1xyXG5cdFx0cmV0dXJuIHRoaXMuZmlyZSgnbW92ZWVuZCcpO1xyXG5cdH0sXHJcblxyXG5cdHNldE1heEJvdW5kczogZnVuY3Rpb24gKGJvdW5kcykge1xyXG5cdFx0Ym91bmRzID0gTC5sYXRMbmdCb3VuZHMoYm91bmRzKTtcclxuXHJcblx0XHR0aGlzLm9wdGlvbnMubWF4Qm91bmRzID0gYm91bmRzO1xyXG5cclxuXHRcdGlmICghYm91bmRzKSB7XHJcblx0XHRcdHJldHVybiB0aGlzLm9mZignbW92ZWVuZCcsIHRoaXMuX3Bhbkluc2lkZU1heEJvdW5kcywgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKHRoaXMuX2xvYWRlZCkge1xyXG5cdFx0XHR0aGlzLl9wYW5JbnNpZGVNYXhCb3VuZHMoKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcy5vbignbW92ZWVuZCcsIHRoaXMuX3Bhbkluc2lkZU1heEJvdW5kcywgdGhpcyk7XHJcblx0fSxcclxuXHJcblx0cGFuSW5zaWRlQm91bmRzOiBmdW5jdGlvbiAoYm91bmRzLCBvcHRpb25zKSB7XHJcblx0XHR2YXIgY2VudGVyID0gdGhpcy5nZXRDZW50ZXIoKSxcclxuXHRcdFx0bmV3Q2VudGVyID0gdGhpcy5fbGltaXRDZW50ZXIoY2VudGVyLCB0aGlzLl96b29tLCBib3VuZHMpO1xyXG5cclxuXHRcdGlmIChjZW50ZXIuZXF1YWxzKG5ld0NlbnRlcikpIHsgcmV0dXJuIHRoaXM7IH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcy5wYW5UbyhuZXdDZW50ZXIsIG9wdGlvbnMpO1xyXG5cdH0sXHJcblxyXG5cdGFkZExheWVyOiBmdW5jdGlvbiAobGF5ZXIpIHtcclxuXHRcdC8vIFRPRE8gbWV0aG9kIGlzIHRvbyBiaWcsIHJlZmFjdG9yXHJcblxyXG5cdFx0dmFyIGlkID0gTC5zdGFtcChsYXllcik7XHJcblxyXG5cdFx0aWYgKHRoaXMuX2xheWVyc1tpZF0pIHsgcmV0dXJuIHRoaXM7IH1cclxuXHJcblx0XHR0aGlzLl9sYXllcnNbaWRdID0gbGF5ZXI7XHJcblxyXG5cdFx0Ly8gVE9ETyBnZXRNYXhab29tLCBnZXRNaW5ab29tIGluIElMYXllciAoaW5zdGVhZCBvZiBvcHRpb25zKVxyXG5cdFx0aWYgKGxheWVyLm9wdGlvbnMgJiYgKCFpc05hTihsYXllci5vcHRpb25zLm1heFpvb20pIHx8ICFpc05hTihsYXllci5vcHRpb25zLm1pblpvb20pKSkge1xyXG5cdFx0XHR0aGlzLl96b29tQm91bmRMYXllcnNbaWRdID0gbGF5ZXI7XHJcblx0XHRcdHRoaXMuX3VwZGF0ZVpvb21MZXZlbHMoKTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBUT0RPIGxvb2tzIHVnbHksIHJlZmFjdG9yISEhXHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnpvb21BbmltYXRpb24gJiYgTC5UaWxlTGF5ZXIgJiYgKGxheWVyIGluc3RhbmNlb2YgTC5UaWxlTGF5ZXIpKSB7XHJcblx0XHRcdHRoaXMuX3RpbGVMYXllcnNOdW0rKztcclxuXHRcdFx0dGhpcy5fdGlsZUxheWVyc1RvTG9hZCsrO1xyXG5cdFx0XHRsYXllci5vbignbG9hZCcsIHRoaXMuX29uVGlsZUxheWVyTG9hZCwgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKHRoaXMuX2xvYWRlZCkge1xyXG5cdFx0XHR0aGlzLl9sYXllckFkZChsYXllcik7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlTGF5ZXI6IGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0dmFyIGlkID0gTC5zdGFtcChsYXllcik7XHJcblxyXG5cdFx0aWYgKCF0aGlzLl9sYXllcnNbaWRdKSB7IHJldHVybiB0aGlzOyB9XHJcblxyXG5cdFx0aWYgKHRoaXMuX2xvYWRlZCkge1xyXG5cdFx0XHRsYXllci5vblJlbW92ZSh0aGlzKTtcclxuXHRcdH1cclxuXHJcblx0XHRkZWxldGUgdGhpcy5fbGF5ZXJzW2lkXTtcclxuXHJcblx0XHRpZiAodGhpcy5fbG9hZGVkKSB7XHJcblx0XHRcdHRoaXMuZmlyZSgnbGF5ZXJyZW1vdmUnLCB7bGF5ZXI6IGxheWVyfSk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKHRoaXMuX3pvb21Cb3VuZExheWVyc1tpZF0pIHtcclxuXHRcdFx0ZGVsZXRlIHRoaXMuX3pvb21Cb3VuZExheWVyc1tpZF07XHJcblx0XHRcdHRoaXMuX3VwZGF0ZVpvb21MZXZlbHMoKTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBUT0RPIGxvb2tzIHVnbHksIHJlZmFjdG9yXHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnpvb21BbmltYXRpb24gJiYgTC5UaWxlTGF5ZXIgJiYgKGxheWVyIGluc3RhbmNlb2YgTC5UaWxlTGF5ZXIpKSB7XHJcblx0XHRcdHRoaXMuX3RpbGVMYXllcnNOdW0tLTtcclxuXHRcdFx0dGhpcy5fdGlsZUxheWVyc1RvTG9hZC0tO1xyXG5cdFx0XHRsYXllci5vZmYoJ2xvYWQnLCB0aGlzLl9vblRpbGVMYXllckxvYWQsIHRoaXMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGhhc0xheWVyOiBmdW5jdGlvbiAobGF5ZXIpIHtcclxuXHRcdGlmICghbGF5ZXIpIHsgcmV0dXJuIGZhbHNlOyB9XHJcblxyXG5cdFx0cmV0dXJuIChMLnN0YW1wKGxheWVyKSBpbiB0aGlzLl9sYXllcnMpO1xyXG5cdH0sXHJcblxyXG5cdGVhY2hMYXllcjogZnVuY3Rpb24gKG1ldGhvZCwgY29udGV4dCkge1xyXG5cdFx0Zm9yICh2YXIgaSBpbiB0aGlzLl9sYXllcnMpIHtcclxuXHRcdFx0bWV0aG9kLmNhbGwoY29udGV4dCwgdGhpcy5fbGF5ZXJzW2ldKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGludmFsaWRhdGVTaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xyXG5cdFx0aWYgKCF0aGlzLl9sb2FkZWQpIHsgcmV0dXJuIHRoaXM7IH1cclxuXHJcblx0XHRvcHRpb25zID0gTC5leHRlbmQoe1xyXG5cdFx0XHRhbmltYXRlOiBmYWxzZSxcclxuXHRcdFx0cGFuOiB0cnVlXHJcblx0XHR9LCBvcHRpb25zID09PSB0cnVlID8ge2FuaW1hdGU6IHRydWV9IDogb3B0aW9ucyk7XHJcblxyXG5cdFx0dmFyIG9sZFNpemUgPSB0aGlzLmdldFNpemUoKTtcclxuXHRcdHRoaXMuX3NpemVDaGFuZ2VkID0gdHJ1ZTtcclxuXHRcdHRoaXMuX2luaXRpYWxDZW50ZXIgPSBudWxsO1xyXG5cclxuXHRcdHZhciBuZXdTaXplID0gdGhpcy5nZXRTaXplKCksXHJcblx0XHQgICAgb2xkQ2VudGVyID0gb2xkU2l6ZS5kaXZpZGVCeSgyKS5yb3VuZCgpLFxyXG5cdFx0ICAgIG5ld0NlbnRlciA9IG5ld1NpemUuZGl2aWRlQnkoMikucm91bmQoKSxcclxuXHRcdCAgICBvZmZzZXQgPSBvbGRDZW50ZXIuc3VidHJhY3QobmV3Q2VudGVyKTtcclxuXHJcblx0XHRpZiAoIW9mZnNldC54ICYmICFvZmZzZXQueSkgeyByZXR1cm4gdGhpczsgfVxyXG5cclxuXHRcdGlmIChvcHRpb25zLmFuaW1hdGUgJiYgb3B0aW9ucy5wYW4pIHtcclxuXHRcdFx0dGhpcy5wYW5CeShvZmZzZXQpO1xyXG5cclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGlmIChvcHRpb25zLnBhbikge1xyXG5cdFx0XHRcdHRoaXMuX3Jhd1BhbkJ5KG9mZnNldCk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHRoaXMuZmlyZSgnbW92ZScpO1xyXG5cclxuXHRcdFx0aWYgKG9wdGlvbnMuZGVib3VuY2VNb3ZlZW5kKSB7XHJcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3NpemVUaW1lcik7XHJcblx0XHRcdFx0dGhpcy5fc2l6ZVRpbWVyID0gc2V0VGltZW91dChMLmJpbmQodGhpcy5maXJlLCB0aGlzLCAnbW92ZWVuZCcpLCAyMDApO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdHRoaXMuZmlyZSgnbW92ZWVuZCcpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuZmlyZSgncmVzaXplJywge1xyXG5cdFx0XHRvbGRTaXplOiBvbGRTaXplLFxyXG5cdFx0XHRuZXdTaXplOiBuZXdTaXplXHJcblx0XHR9KTtcclxuXHR9LFxyXG5cclxuXHQvLyBUT0RPIGhhbmRsZXIuYWRkVG9cclxuXHRhZGRIYW5kbGVyOiBmdW5jdGlvbiAobmFtZSwgSGFuZGxlckNsYXNzKSB7XHJcblx0XHRpZiAoIUhhbmRsZXJDbGFzcykgeyByZXR1cm4gdGhpczsgfVxyXG5cclxuXHRcdHZhciBoYW5kbGVyID0gdGhpc1tuYW1lXSA9IG5ldyBIYW5kbGVyQ2xhc3ModGhpcyk7XHJcblxyXG5cdFx0dGhpcy5faGFuZGxlcnMucHVzaChoYW5kbGVyKTtcclxuXHJcblx0XHRpZiAodGhpcy5vcHRpb25zW25hbWVdKSB7XHJcblx0XHRcdGhhbmRsZXIuZW5hYmxlKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fbG9hZGVkKSB7XHJcblx0XHRcdHRoaXMuZmlyZSgndW5sb2FkJyk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5faW5pdEV2ZW50cygnb2ZmJyk7XHJcblxyXG5cdFx0dHJ5IHtcclxuXHRcdFx0Ly8gdGhyb3dzIGVycm9yIGluIElFNi04XHJcblx0XHRcdGRlbGV0ZSB0aGlzLl9jb250YWluZXIuX2xlYWZsZXQ7XHJcblx0XHR9IGNhdGNoIChlKSB7XHJcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5fbGVhZmxldCA9IHVuZGVmaW5lZDtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9jbGVhclBhbmVzKCk7XHJcblx0XHRpZiAodGhpcy5fY2xlYXJDb250cm9sUG9zKSB7XHJcblx0XHRcdHRoaXMuX2NsZWFyQ29udHJvbFBvcygpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2NsZWFySGFuZGxlcnMoKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHJcblx0Ly8gcHVibGljIG1ldGhvZHMgZm9yIGdldHRpbmcgbWFwIHN0YXRlXHJcblxyXG5cdGdldENlbnRlcjogZnVuY3Rpb24gKCkgeyAvLyAoQm9vbGVhbikgLT4gTGF0TG5nXHJcblx0XHR0aGlzLl9jaGVja0lmTG9hZGVkKCk7XHJcblxyXG5cdFx0aWYgKHRoaXMuX2luaXRpYWxDZW50ZXIgJiYgIXRoaXMuX21vdmVkKCkpIHtcclxuXHRcdFx0cmV0dXJuIHRoaXMuX2luaXRpYWxDZW50ZXI7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcy5sYXllclBvaW50VG9MYXRMbmcodGhpcy5fZ2V0Q2VudGVyTGF5ZXJQb2ludCgpKTtcclxuXHR9LFxyXG5cclxuXHRnZXRab29tOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fem9vbTtcclxuXHR9LFxyXG5cclxuXHRnZXRCb3VuZHM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBib3VuZHMgPSB0aGlzLmdldFBpeGVsQm91bmRzKCksXHJcblx0XHQgICAgc3cgPSB0aGlzLnVucHJvamVjdChib3VuZHMuZ2V0Qm90dG9tTGVmdCgpKSxcclxuXHRcdCAgICBuZSA9IHRoaXMudW5wcm9qZWN0KGJvdW5kcy5nZXRUb3BSaWdodCgpKTtcclxuXHJcblx0XHRyZXR1cm4gbmV3IEwuTGF0TG5nQm91bmRzKHN3LCBuZSk7XHJcblx0fSxcclxuXHJcblx0Z2V0TWluWm9vbTogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5taW5ab29tID09PSB1bmRlZmluZWQgP1xyXG5cdFx0XHQodGhpcy5fbGF5ZXJzTWluWm9vbSA9PT0gdW5kZWZpbmVkID8gMCA6IHRoaXMuX2xheWVyc01pblpvb20pIDpcclxuXHRcdFx0dGhpcy5vcHRpb25zLm1pblpvb207XHJcblx0fSxcclxuXHJcblx0Z2V0TWF4Wm9vbTogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5tYXhab29tID09PSB1bmRlZmluZWQgP1xyXG5cdFx0XHQodGhpcy5fbGF5ZXJzTWF4Wm9vbSA9PT0gdW5kZWZpbmVkID8gSW5maW5pdHkgOiB0aGlzLl9sYXllcnNNYXhab29tKSA6XHJcblx0XHRcdHRoaXMub3B0aW9ucy5tYXhab29tO1xyXG5cdH0sXHJcblxyXG5cdGdldEJvdW5kc1pvb206IGZ1bmN0aW9uIChib3VuZHMsIGluc2lkZSwgcGFkZGluZykgeyAvLyAoTGF0TG5nQm91bmRzWywgQm9vbGVhbiwgUG9pbnRdKSAtPiBOdW1iZXJcclxuXHRcdGJvdW5kcyA9IEwubGF0TG5nQm91bmRzKGJvdW5kcyk7XHJcblxyXG5cdFx0dmFyIHpvb20gPSB0aGlzLmdldE1pblpvb20oKSAtIChpbnNpZGUgPyAxIDogMCksXHJcblx0XHQgICAgbWF4Wm9vbSA9IHRoaXMuZ2V0TWF4Wm9vbSgpLFxyXG5cdFx0ICAgIHNpemUgPSB0aGlzLmdldFNpemUoKSxcclxuXHJcblx0XHQgICAgbncgPSBib3VuZHMuZ2V0Tm9ydGhXZXN0KCksXHJcblx0XHQgICAgc2UgPSBib3VuZHMuZ2V0U291dGhFYXN0KCksXHJcblxyXG5cdFx0ICAgIHpvb21Ob3RGb3VuZCA9IHRydWUsXHJcblx0XHQgICAgYm91bmRzU2l6ZTtcclxuXHJcblx0XHRwYWRkaW5nID0gTC5wb2ludChwYWRkaW5nIHx8IFswLCAwXSk7XHJcblxyXG5cdFx0ZG8ge1xyXG5cdFx0XHR6b29tKys7XHJcblx0XHRcdGJvdW5kc1NpemUgPSB0aGlzLnByb2plY3Qoc2UsIHpvb20pLnN1YnRyYWN0KHRoaXMucHJvamVjdChudywgem9vbSkpLmFkZChwYWRkaW5nKTtcclxuXHRcdFx0em9vbU5vdEZvdW5kID0gIWluc2lkZSA/IHNpemUuY29udGFpbnMoYm91bmRzU2l6ZSkgOiBib3VuZHNTaXplLnggPCBzaXplLnggfHwgYm91bmRzU2l6ZS55IDwgc2l6ZS55O1xyXG5cclxuXHRcdH0gd2hpbGUgKHpvb21Ob3RGb3VuZCAmJiB6b29tIDw9IG1heFpvb20pO1xyXG5cclxuXHRcdGlmICh6b29tTm90Rm91bmQgJiYgaW5zaWRlKSB7XHJcblx0XHRcdHJldHVybiBudWxsO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBpbnNpZGUgPyB6b29tIDogem9vbSAtIDE7XHJcblx0fSxcclxuXHJcblx0Z2V0U2l6ZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9zaXplIHx8IHRoaXMuX3NpemVDaGFuZ2VkKSB7XHJcblx0XHRcdHRoaXMuX3NpemUgPSBuZXcgTC5Qb2ludChcclxuXHRcdFx0XHR0aGlzLl9jb250YWluZXIuY2xpZW50V2lkdGgsXHJcblx0XHRcdFx0dGhpcy5fY29udGFpbmVyLmNsaWVudEhlaWdodCk7XHJcblxyXG5cdFx0XHR0aGlzLl9zaXplQ2hhbmdlZCA9IGZhbHNlO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXMuX3NpemUuY2xvbmUoKTtcclxuXHR9LFxyXG5cclxuXHRnZXRQaXhlbEJvdW5kczogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHRvcExlZnRQb2ludCA9IHRoaXMuX2dldFRvcExlZnRQb2ludCgpO1xyXG5cdFx0cmV0dXJuIG5ldyBMLkJvdW5kcyh0b3BMZWZ0UG9pbnQsIHRvcExlZnRQb2ludC5hZGQodGhpcy5nZXRTaXplKCkpKTtcclxuXHR9LFxyXG5cclxuXHRnZXRQaXhlbE9yaWdpbjogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpcy5fY2hlY2tJZkxvYWRlZCgpO1xyXG5cdFx0cmV0dXJuIHRoaXMuX2luaXRpYWxUb3BMZWZ0UG9pbnQ7XHJcblx0fSxcclxuXHJcblx0Z2V0UGFuZXM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9wYW5lcztcclxuXHR9LFxyXG5cclxuXHRnZXRDb250YWluZXI6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9jb250YWluZXI7XHJcblx0fSxcclxuXHJcblxyXG5cdC8vIFRPRE8gcmVwbGFjZSB3aXRoIHVuaXZlcnNhbCBpbXBsZW1lbnRhdGlvbiBhZnRlciByZWZhY3RvcmluZyBwcm9qZWN0aW9uc1xyXG5cclxuXHRnZXRab29tU2NhbGU6IGZ1bmN0aW9uICh0b1pvb20pIHtcclxuXHRcdHZhciBjcnMgPSB0aGlzLm9wdGlvbnMuY3JzO1xyXG5cdFx0cmV0dXJuIGNycy5zY2FsZSh0b1pvb20pIC8gY3JzLnNjYWxlKHRoaXMuX3pvb20pO1xyXG5cdH0sXHJcblxyXG5cdGdldFNjYWxlWm9vbTogZnVuY3Rpb24gKHNjYWxlKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fem9vbSArIChNYXRoLmxvZyhzY2FsZSkgLyBNYXRoLkxOMik7XHJcblx0fSxcclxuXHJcblxyXG5cdC8vIGNvbnZlcnNpb24gbWV0aG9kc1xyXG5cclxuXHRwcm9qZWN0OiBmdW5jdGlvbiAobGF0bG5nLCB6b29tKSB7IC8vIChMYXRMbmdbLCBOdW1iZXJdKSAtPiBQb2ludFxyXG5cdFx0em9vbSA9IHpvb20gPT09IHVuZGVmaW5lZCA/IHRoaXMuX3pvb20gOiB6b29tO1xyXG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5jcnMubGF0TG5nVG9Qb2ludChMLmxhdExuZyhsYXRsbmcpLCB6b29tKTtcclxuXHR9LFxyXG5cclxuXHR1bnByb2plY3Q6IGZ1bmN0aW9uIChwb2ludCwgem9vbSkgeyAvLyAoUG9pbnRbLCBOdW1iZXJdKSAtPiBMYXRMbmdcclxuXHRcdHpvb20gPSB6b29tID09PSB1bmRlZmluZWQgPyB0aGlzLl96b29tIDogem9vbTtcclxuXHRcdHJldHVybiB0aGlzLm9wdGlvbnMuY3JzLnBvaW50VG9MYXRMbmcoTC5wb2ludChwb2ludCksIHpvb20pO1xyXG5cdH0sXHJcblxyXG5cdGxheWVyUG9pbnRUb0xhdExuZzogZnVuY3Rpb24gKHBvaW50KSB7IC8vIChQb2ludClcclxuXHRcdHZhciBwcm9qZWN0ZWRQb2ludCA9IEwucG9pbnQocG9pbnQpLmFkZCh0aGlzLmdldFBpeGVsT3JpZ2luKCkpO1xyXG5cdFx0cmV0dXJuIHRoaXMudW5wcm9qZWN0KHByb2plY3RlZFBvaW50KTtcclxuXHR9LFxyXG5cclxuXHRsYXRMbmdUb0xheWVyUG9pbnQ6IGZ1bmN0aW9uIChsYXRsbmcpIHsgLy8gKExhdExuZylcclxuXHRcdHZhciBwcm9qZWN0ZWRQb2ludCA9IHRoaXMucHJvamVjdChMLmxhdExuZyhsYXRsbmcpKS5fcm91bmQoKTtcclxuXHRcdHJldHVybiBwcm9qZWN0ZWRQb2ludC5fc3VidHJhY3QodGhpcy5nZXRQaXhlbE9yaWdpbigpKTtcclxuXHR9LFxyXG5cclxuXHRjb250YWluZXJQb2ludFRvTGF5ZXJQb2ludDogZnVuY3Rpb24gKHBvaW50KSB7IC8vIChQb2ludClcclxuXHRcdHJldHVybiBMLnBvaW50KHBvaW50KS5zdWJ0cmFjdCh0aGlzLl9nZXRNYXBQYW5lUG9zKCkpO1xyXG5cdH0sXHJcblxyXG5cdGxheWVyUG9pbnRUb0NvbnRhaW5lclBvaW50OiBmdW5jdGlvbiAocG9pbnQpIHsgLy8gKFBvaW50KVxyXG5cdFx0cmV0dXJuIEwucG9pbnQocG9pbnQpLmFkZCh0aGlzLl9nZXRNYXBQYW5lUG9zKCkpO1xyXG5cdH0sXHJcblxyXG5cdGNvbnRhaW5lclBvaW50VG9MYXRMbmc6IGZ1bmN0aW9uIChwb2ludCkge1xyXG5cdFx0dmFyIGxheWVyUG9pbnQgPSB0aGlzLmNvbnRhaW5lclBvaW50VG9MYXllclBvaW50KEwucG9pbnQocG9pbnQpKTtcclxuXHRcdHJldHVybiB0aGlzLmxheWVyUG9pbnRUb0xhdExuZyhsYXllclBvaW50KTtcclxuXHR9LFxyXG5cclxuXHRsYXRMbmdUb0NvbnRhaW5lclBvaW50OiBmdW5jdGlvbiAobGF0bG5nKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5sYXllclBvaW50VG9Db250YWluZXJQb2ludCh0aGlzLmxhdExuZ1RvTGF5ZXJQb2ludChMLmxhdExuZyhsYXRsbmcpKSk7XHJcblx0fSxcclxuXHJcblx0bW91c2VFdmVudFRvQ29udGFpbmVyUG9pbnQ6IGZ1bmN0aW9uIChlKSB7IC8vIChNb3VzZUV2ZW50KVxyXG5cdFx0cmV0dXJuIEwuRG9tRXZlbnQuZ2V0TW91c2VQb3NpdGlvbihlLCB0aGlzLl9jb250YWluZXIpO1xyXG5cdH0sXHJcblxyXG5cdG1vdXNlRXZlbnRUb0xheWVyUG9pbnQ6IGZ1bmN0aW9uIChlKSB7IC8vIChNb3VzZUV2ZW50KVxyXG5cdFx0cmV0dXJuIHRoaXMuY29udGFpbmVyUG9pbnRUb0xheWVyUG9pbnQodGhpcy5tb3VzZUV2ZW50VG9Db250YWluZXJQb2ludChlKSk7XHJcblx0fSxcclxuXHJcblx0bW91c2VFdmVudFRvTGF0TG5nOiBmdW5jdGlvbiAoZSkgeyAvLyAoTW91c2VFdmVudClcclxuXHRcdHJldHVybiB0aGlzLmxheWVyUG9pbnRUb0xhdExuZyh0aGlzLm1vdXNlRXZlbnRUb0xheWVyUG9pbnQoZSkpO1xyXG5cdH0sXHJcblxyXG5cclxuXHQvLyBtYXAgaW5pdGlhbGl6YXRpb24gbWV0aG9kc1xyXG5cclxuXHRfaW5pdENvbnRhaW5lcjogZnVuY3Rpb24gKGlkKSB7XHJcblx0XHR2YXIgY29udGFpbmVyID0gdGhpcy5fY29udGFpbmVyID0gTC5Eb21VdGlsLmdldChpZCk7XHJcblxyXG5cdFx0aWYgKCFjb250YWluZXIpIHtcclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNYXAgY29udGFpbmVyIG5vdCBmb3VuZC4nKTtcclxuXHRcdH0gZWxzZSBpZiAoY29udGFpbmVyLl9sZWFmbGV0KSB7XHJcblx0XHRcdHRocm93IG5ldyBFcnJvcignTWFwIGNvbnRhaW5lciBpcyBhbHJlYWR5IGluaXRpYWxpemVkLicpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGNvbnRhaW5lci5fbGVhZmxldCA9IHRydWU7XHJcblx0fSxcclxuXHJcblx0X2luaXRMYXlvdXQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBjb250YWluZXIgPSB0aGlzLl9jb250YWluZXI7XHJcblxyXG5cdFx0TC5Eb21VdGlsLmFkZENsYXNzKGNvbnRhaW5lciwgJ2xlYWZsZXQtY29udGFpbmVyJyArXHJcblx0XHRcdChMLkJyb3dzZXIudG91Y2ggPyAnIGxlYWZsZXQtdG91Y2gnIDogJycpICtcclxuXHRcdFx0KEwuQnJvd3Nlci5yZXRpbmEgPyAnIGxlYWZsZXQtcmV0aW5hJyA6ICcnKSArXHJcblx0XHRcdChMLkJyb3dzZXIuaWVsdDkgPyAnIGxlYWZsZXQtb2xkaWUnIDogJycpICtcclxuXHRcdFx0KHRoaXMub3B0aW9ucy5mYWRlQW5pbWF0aW9uID8gJyBsZWFmbGV0LWZhZGUtYW5pbScgOiAnJykpO1xyXG5cclxuXHRcdHZhciBwb3NpdGlvbiA9IEwuRG9tVXRpbC5nZXRTdHlsZShjb250YWluZXIsICdwb3NpdGlvbicpO1xyXG5cclxuXHRcdGlmIChwb3NpdGlvbiAhPT0gJ2Fic29sdXRlJyAmJiBwb3NpdGlvbiAhPT0gJ3JlbGF0aXZlJyAmJiBwb3NpdGlvbiAhPT0gJ2ZpeGVkJykge1xyXG5cdFx0XHRjb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2luaXRQYW5lcygpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9pbml0Q29udHJvbFBvcykge1xyXG5cdFx0XHR0aGlzLl9pbml0Q29udHJvbFBvcygpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9pbml0UGFuZXM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBwYW5lcyA9IHRoaXMuX3BhbmVzID0ge307XHJcblxyXG5cdFx0dGhpcy5fbWFwUGFuZSA9IHBhbmVzLm1hcFBhbmUgPSB0aGlzLl9jcmVhdGVQYW5lKCdsZWFmbGV0LW1hcC1wYW5lJywgdGhpcy5fY29udGFpbmVyKTtcclxuXHJcblx0XHR0aGlzLl90aWxlUGFuZSA9IHBhbmVzLnRpbGVQYW5lID0gdGhpcy5fY3JlYXRlUGFuZSgnbGVhZmxldC10aWxlLXBhbmUnLCB0aGlzLl9tYXBQYW5lKTtcclxuXHRcdHBhbmVzLm9iamVjdHNQYW5lID0gdGhpcy5fY3JlYXRlUGFuZSgnbGVhZmxldC1vYmplY3RzLXBhbmUnLCB0aGlzLl9tYXBQYW5lKTtcclxuXHRcdHBhbmVzLnNoYWRvd1BhbmUgPSB0aGlzLl9jcmVhdGVQYW5lKCdsZWFmbGV0LXNoYWRvdy1wYW5lJyk7XHJcblx0XHRwYW5lcy5vdmVybGF5UGFuZSA9IHRoaXMuX2NyZWF0ZVBhbmUoJ2xlYWZsZXQtb3ZlcmxheS1wYW5lJyk7XHJcblx0XHRwYW5lcy5tYXJrZXJQYW5lID0gdGhpcy5fY3JlYXRlUGFuZSgnbGVhZmxldC1tYXJrZXItcGFuZScpO1xyXG5cdFx0cGFuZXMucG9wdXBQYW5lID0gdGhpcy5fY3JlYXRlUGFuZSgnbGVhZmxldC1wb3B1cC1wYW5lJyk7XHJcblxyXG5cdFx0dmFyIHpvb21IaWRlID0gJyBsZWFmbGV0LXpvb20taGlkZSc7XHJcblxyXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMubWFya2VyWm9vbUFuaW1hdGlvbikge1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3MocGFuZXMubWFya2VyUGFuZSwgem9vbUhpZGUpO1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3MocGFuZXMuc2hhZG93UGFuZSwgem9vbUhpZGUpO1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3MocGFuZXMucG9wdXBQYW5lLCB6b29tSGlkZSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2NyZWF0ZVBhbmU6IGZ1bmN0aW9uIChjbGFzc05hbWUsIGNvbnRhaW5lcikge1xyXG5cdFx0cmV0dXJuIEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsIGNsYXNzTmFtZSwgY29udGFpbmVyIHx8IHRoaXMuX3BhbmVzLm9iamVjdHNQYW5lKTtcclxuXHR9LFxyXG5cclxuXHRfY2xlYXJQYW5lczogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpcy5fY29udGFpbmVyLnJlbW92ZUNoaWxkKHRoaXMuX21hcFBhbmUpO1xyXG5cdH0sXHJcblxyXG5cdF9hZGRMYXllcnM6IGZ1bmN0aW9uIChsYXllcnMpIHtcclxuXHRcdGxheWVycyA9IGxheWVycyA/IChMLlV0aWwuaXNBcnJheShsYXllcnMpID8gbGF5ZXJzIDogW2xheWVyc10pIDogW107XHJcblxyXG5cdFx0Zm9yICh2YXIgaSA9IDAsIGxlbiA9IGxheWVycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHR0aGlzLmFkZExheWVyKGxheWVyc1tpXSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblxyXG5cdC8vIHByaXZhdGUgbWV0aG9kcyB0aGF0IG1vZGlmeSBtYXAgc3RhdGVcclxuXHJcblx0X3Jlc2V0VmlldzogZnVuY3Rpb24gKGNlbnRlciwgem9vbSwgcHJlc2VydmVNYXBPZmZzZXQsIGFmdGVyWm9vbUFuaW0pIHtcclxuXHJcblx0XHR2YXIgem9vbUNoYW5nZWQgPSAodGhpcy5fem9vbSAhPT0gem9vbSk7XHJcblxyXG5cdFx0aWYgKCFhZnRlclpvb21BbmltKSB7XHJcblx0XHRcdHRoaXMuZmlyZSgnbW92ZXN0YXJ0Jyk7XHJcblxyXG5cdFx0XHRpZiAoem9vbUNoYW5nZWQpIHtcclxuXHRcdFx0XHR0aGlzLmZpcmUoJ3pvb21zdGFydCcpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fem9vbSA9IHpvb207XHJcblx0XHR0aGlzLl9pbml0aWFsQ2VudGVyID0gY2VudGVyO1xyXG5cclxuXHRcdHRoaXMuX2luaXRpYWxUb3BMZWZ0UG9pbnQgPSB0aGlzLl9nZXROZXdUb3BMZWZ0UG9pbnQoY2VudGVyKTtcclxuXHJcblx0XHRpZiAoIXByZXNlcnZlTWFwT2Zmc2V0KSB7XHJcblx0XHRcdEwuRG9tVXRpbC5zZXRQb3NpdGlvbih0aGlzLl9tYXBQYW5lLCBuZXcgTC5Qb2ludCgwLCAwKSk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0aGlzLl9pbml0aWFsVG9wTGVmdFBvaW50Ll9hZGQodGhpcy5fZ2V0TWFwUGFuZVBvcygpKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl90aWxlTGF5ZXJzVG9Mb2FkID0gdGhpcy5fdGlsZUxheWVyc051bTtcclxuXHJcblx0XHR2YXIgbG9hZGluZyA9ICF0aGlzLl9sb2FkZWQ7XHJcblx0XHR0aGlzLl9sb2FkZWQgPSB0cnVlO1xyXG5cclxuXHRcdHRoaXMuZmlyZSgndmlld3Jlc2V0Jywge2hhcmQ6ICFwcmVzZXJ2ZU1hcE9mZnNldH0pO1xyXG5cclxuXHRcdGlmIChsb2FkaW5nKSB7XHJcblx0XHRcdHRoaXMuZmlyZSgnbG9hZCcpO1xyXG5cdFx0XHR0aGlzLmVhY2hMYXllcih0aGlzLl9sYXllckFkZCwgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5maXJlKCdtb3ZlJyk7XHJcblxyXG5cdFx0aWYgKHpvb21DaGFuZ2VkIHx8IGFmdGVyWm9vbUFuaW0pIHtcclxuXHRcdFx0dGhpcy5maXJlKCd6b29tZW5kJyk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5maXJlKCdtb3ZlZW5kJywge2hhcmQ6ICFwcmVzZXJ2ZU1hcE9mZnNldH0pO1xyXG5cdH0sXHJcblxyXG5cdF9yYXdQYW5CeTogZnVuY3Rpb24gKG9mZnNldCkge1xyXG5cdFx0TC5Eb21VdGlsLnNldFBvc2l0aW9uKHRoaXMuX21hcFBhbmUsIHRoaXMuX2dldE1hcFBhbmVQb3MoKS5zdWJ0cmFjdChvZmZzZXQpKTtcclxuXHR9LFxyXG5cclxuXHRfZ2V0Wm9vbVNwYW46IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLmdldE1heFpvb20oKSAtIHRoaXMuZ2V0TWluWm9vbSgpO1xyXG5cdH0sXHJcblxyXG5cdF91cGRhdGVab29tTGV2ZWxzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgaSxcclxuXHRcdFx0bWluWm9vbSA9IEluZmluaXR5LFxyXG5cdFx0XHRtYXhab29tID0gLUluZmluaXR5LFxyXG5cdFx0XHRvbGRab29tU3BhbiA9IHRoaXMuX2dldFpvb21TcGFuKCk7XHJcblxyXG5cdFx0Zm9yIChpIGluIHRoaXMuX3pvb21Cb3VuZExheWVycykge1xyXG5cdFx0XHR2YXIgbGF5ZXIgPSB0aGlzLl96b29tQm91bmRMYXllcnNbaV07XHJcblx0XHRcdGlmICghaXNOYU4obGF5ZXIub3B0aW9ucy5taW5ab29tKSkge1xyXG5cdFx0XHRcdG1pblpvb20gPSBNYXRoLm1pbihtaW5ab29tLCBsYXllci5vcHRpb25zLm1pblpvb20pO1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmICghaXNOYU4obGF5ZXIub3B0aW9ucy5tYXhab29tKSkge1xyXG5cdFx0XHRcdG1heFpvb20gPSBNYXRoLm1heChtYXhab29tLCBsYXllci5vcHRpb25zLm1heFpvb20pO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKGkgPT09IHVuZGVmaW5lZCkgeyAvLyB3ZSBoYXZlIG5vIHRpbGVsYXllcnNcclxuXHRcdFx0dGhpcy5fbGF5ZXJzTWF4Wm9vbSA9IHRoaXMuX2xheWVyc01pblpvb20gPSB1bmRlZmluZWQ7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0aGlzLl9sYXllcnNNYXhab29tID0gbWF4Wm9vbTtcclxuXHRcdFx0dGhpcy5fbGF5ZXJzTWluWm9vbSA9IG1pblpvb207XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKG9sZFpvb21TcGFuICE9PSB0aGlzLl9nZXRab29tU3BhbigpKSB7XHJcblx0XHRcdHRoaXMuZmlyZSgnem9vbWxldmVsc2NoYW5nZScpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9wYW5JbnNpZGVNYXhCb3VuZHM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHRoaXMucGFuSW5zaWRlQm91bmRzKHRoaXMub3B0aW9ucy5tYXhCb3VuZHMpO1xyXG5cdH0sXHJcblxyXG5cdF9jaGVja0lmTG9hZGVkOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAoIXRoaXMuX2xvYWRlZCkge1xyXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1NldCBtYXAgY2VudGVyIGFuZCB6b29tIGZpcnN0LicpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdC8vIG1hcCBldmVudHNcclxuXHJcblx0X2luaXRFdmVudHM6IGZ1bmN0aW9uIChvbk9mZikge1xyXG5cdFx0aWYgKCFMLkRvbUV2ZW50KSB7IHJldHVybjsgfVxyXG5cclxuXHRcdG9uT2ZmID0gb25PZmYgfHwgJ29uJztcclxuXHJcblx0XHRMLkRvbUV2ZW50W29uT2ZmXSh0aGlzLl9jb250YWluZXIsICdjbGljaycsIHRoaXMuX29uTW91c2VDbGljaywgdGhpcyk7XHJcblxyXG5cdFx0dmFyIGV2ZW50cyA9IFsnZGJsY2xpY2snLCAnbW91c2Vkb3duJywgJ21vdXNldXAnLCAnbW91c2VlbnRlcicsXHJcblx0XHQgICAgICAgICAgICAgICdtb3VzZWxlYXZlJywgJ21vdXNlbW92ZScsICdjb250ZXh0bWVudSddLFxyXG5cdFx0ICAgIGksIGxlbjtcclxuXHJcblx0XHRmb3IgKGkgPSAwLCBsZW4gPSBldmVudHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0TC5Eb21FdmVudFtvbk9mZl0odGhpcy5fY29udGFpbmVyLCBldmVudHNbaV0sIHRoaXMuX2ZpcmVNb3VzZUV2ZW50LCB0aGlzKTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnRyYWNrUmVzaXplKSB7XHJcblx0XHRcdEwuRG9tRXZlbnRbb25PZmZdKHdpbmRvdywgJ3Jlc2l6ZScsIHRoaXMuX29uUmVzaXplLCB0aGlzKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfb25SZXNpemU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdEwuVXRpbC5jYW5jZWxBbmltRnJhbWUodGhpcy5fcmVzaXplUmVxdWVzdCk7XHJcblx0XHR0aGlzLl9yZXNpemVSZXF1ZXN0ID0gTC5VdGlsLnJlcXVlc3RBbmltRnJhbWUoXHJcblx0XHQgICAgICAgIGZ1bmN0aW9uICgpIHsgdGhpcy5pbnZhbGlkYXRlU2l6ZSh7ZGVib3VuY2VNb3ZlZW5kOiB0cnVlfSk7IH0sIHRoaXMsIGZhbHNlLCB0aGlzLl9jb250YWluZXIpO1xyXG5cdH0sXHJcblxyXG5cdF9vbk1vdXNlQ2xpY2s6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHRpZiAoIXRoaXMuX2xvYWRlZCB8fCAoIWUuX3NpbXVsYXRlZCAmJlxyXG5cdFx0ICAgICAgICAoKHRoaXMuZHJhZ2dpbmcgJiYgdGhpcy5kcmFnZ2luZy5tb3ZlZCgpKSB8fFxyXG5cdFx0ICAgICAgICAgKHRoaXMuYm94Wm9vbSAgJiYgdGhpcy5ib3hab29tLm1vdmVkKCkpKSkgfHxcclxuXHRcdCAgICAgICAgICAgIEwuRG9tRXZlbnQuX3NraXBwZWQoZSkpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dGhpcy5maXJlKCdwcmVjbGljaycpO1xyXG5cdFx0dGhpcy5fZmlyZU1vdXNlRXZlbnQoZSk7XHJcblx0fSxcclxuXHJcblx0X2ZpcmVNb3VzZUV2ZW50OiBmdW5jdGlvbiAoZSkge1xyXG5cdFx0aWYgKCF0aGlzLl9sb2FkZWQgfHwgTC5Eb21FdmVudC5fc2tpcHBlZChlKSkgeyByZXR1cm47IH1cclxuXHJcblx0XHR2YXIgdHlwZSA9IGUudHlwZTtcclxuXHJcblx0XHR0eXBlID0gKHR5cGUgPT09ICdtb3VzZWVudGVyJyA/ICdtb3VzZW92ZXInIDogKHR5cGUgPT09ICdtb3VzZWxlYXZlJyA/ICdtb3VzZW91dCcgOiB0eXBlKSk7XHJcblxyXG5cdFx0aWYgKCF0aGlzLmhhc0V2ZW50TGlzdGVuZXJzKHR5cGUpKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdGlmICh0eXBlID09PSAnY29udGV4dG1lbnUnKSB7XHJcblx0XHRcdEwuRG9tRXZlbnQucHJldmVudERlZmF1bHQoZSk7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIGNvbnRhaW5lclBvaW50ID0gdGhpcy5tb3VzZUV2ZW50VG9Db250YWluZXJQb2ludChlKSxcclxuXHRcdCAgICBsYXllclBvaW50ID0gdGhpcy5jb250YWluZXJQb2ludFRvTGF5ZXJQb2ludChjb250YWluZXJQb2ludCksXHJcblx0XHQgICAgbGF0bG5nID0gdGhpcy5sYXllclBvaW50VG9MYXRMbmcobGF5ZXJQb2ludCk7XHJcblxyXG5cdFx0dGhpcy5maXJlKHR5cGUsIHtcclxuXHRcdFx0bGF0bG5nOiBsYXRsbmcsXHJcblx0XHRcdGxheWVyUG9pbnQ6IGxheWVyUG9pbnQsXHJcblx0XHRcdGNvbnRhaW5lclBvaW50OiBjb250YWluZXJQb2ludCxcclxuXHRcdFx0b3JpZ2luYWxFdmVudDogZVxyXG5cdFx0fSk7XHJcblx0fSxcclxuXHJcblx0X29uVGlsZUxheWVyTG9hZDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpcy5fdGlsZUxheWVyc1RvTG9hZC0tO1xyXG5cdFx0aWYgKHRoaXMuX3RpbGVMYXllcnNOdW0gJiYgIXRoaXMuX3RpbGVMYXllcnNUb0xvYWQpIHtcclxuXHRcdFx0dGhpcy5maXJlKCd0aWxlbGF5ZXJzbG9hZCcpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9jbGVhckhhbmRsZXJzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRmb3IgKHZhciBpID0gMCwgbGVuID0gdGhpcy5faGFuZGxlcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0dGhpcy5faGFuZGxlcnNbaV0uZGlzYWJsZSgpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdHdoZW5SZWFkeTogZnVuY3Rpb24gKGNhbGxiYWNrLCBjb250ZXh0KSB7XHJcblx0XHRpZiAodGhpcy5fbG9hZGVkKSB7XHJcblx0XHRcdGNhbGxiYWNrLmNhbGwoY29udGV4dCB8fCB0aGlzLCB0aGlzKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMub24oJ2xvYWQnLCBjYWxsYmFjaywgY29udGV4dCk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRfbGF5ZXJBZGQ6IGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0bGF5ZXIub25BZGQodGhpcyk7XHJcblx0XHR0aGlzLmZpcmUoJ2xheWVyYWRkJywge2xheWVyOiBsYXllcn0pO1xyXG5cdH0sXHJcblxyXG5cclxuXHQvLyBwcml2YXRlIG1ldGhvZHMgZm9yIGdldHRpbmcgbWFwIHN0YXRlXHJcblxyXG5cdF9nZXRNYXBQYW5lUG9zOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gTC5Eb21VdGlsLmdldFBvc2l0aW9uKHRoaXMuX21hcFBhbmUpO1xyXG5cdH0sXHJcblxyXG5cdF9tb3ZlZDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHBvcyA9IHRoaXMuX2dldE1hcFBhbmVQb3MoKTtcclxuXHRcdHJldHVybiBwb3MgJiYgIXBvcy5lcXVhbHMoWzAsIDBdKTtcclxuXHR9LFxyXG5cclxuXHRfZ2V0VG9wTGVmdFBvaW50OiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5nZXRQaXhlbE9yaWdpbigpLnN1YnRyYWN0KHRoaXMuX2dldE1hcFBhbmVQb3MoKSk7XHJcblx0fSxcclxuXHJcblx0X2dldE5ld1RvcExlZnRQb2ludDogZnVuY3Rpb24gKGNlbnRlciwgem9vbSkge1xyXG5cdFx0dmFyIHZpZXdIYWxmID0gdGhpcy5nZXRTaXplKCkuX2RpdmlkZUJ5KDIpO1xyXG5cdFx0Ly8gVE9ETyByb3VuZCBvbiBkaXNwbGF5LCBub3QgY2FsY3VsYXRpb24gdG8gaW5jcmVhc2UgcHJlY2lzaW9uP1xyXG5cdFx0cmV0dXJuIHRoaXMucHJvamVjdChjZW50ZXIsIHpvb20pLl9zdWJ0cmFjdCh2aWV3SGFsZikuX3JvdW5kKCk7XHJcblx0fSxcclxuXHJcblx0X2xhdExuZ1RvTmV3TGF5ZXJQb2ludDogZnVuY3Rpb24gKGxhdGxuZywgbmV3Wm9vbSwgbmV3Q2VudGVyKSB7XHJcblx0XHR2YXIgdG9wTGVmdCA9IHRoaXMuX2dldE5ld1RvcExlZnRQb2ludChuZXdDZW50ZXIsIG5ld1pvb20pLmFkZCh0aGlzLl9nZXRNYXBQYW5lUG9zKCkpO1xyXG5cdFx0cmV0dXJuIHRoaXMucHJvamVjdChsYXRsbmcsIG5ld1pvb20pLl9zdWJ0cmFjdCh0b3BMZWZ0KTtcclxuXHR9LFxyXG5cclxuXHQvLyBsYXllciBwb2ludCBvZiB0aGUgY3VycmVudCBjZW50ZXJcclxuXHRfZ2V0Q2VudGVyTGF5ZXJQb2ludDogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuY29udGFpbmVyUG9pbnRUb0xheWVyUG9pbnQodGhpcy5nZXRTaXplKCkuX2RpdmlkZUJ5KDIpKTtcclxuXHR9LFxyXG5cclxuXHQvLyBvZmZzZXQgb2YgdGhlIHNwZWNpZmllZCBwbGFjZSB0byB0aGUgY3VycmVudCBjZW50ZXIgaW4gcGl4ZWxzXHJcblx0X2dldENlbnRlck9mZnNldDogZnVuY3Rpb24gKGxhdGxuZykge1xyXG5cdFx0cmV0dXJuIHRoaXMubGF0TG5nVG9MYXllclBvaW50KGxhdGxuZykuc3VidHJhY3QodGhpcy5fZ2V0Q2VudGVyTGF5ZXJQb2ludCgpKTtcclxuXHR9LFxyXG5cclxuXHQvLyBhZGp1c3QgY2VudGVyIGZvciB2aWV3IHRvIGdldCBpbnNpZGUgYm91bmRzXHJcblx0X2xpbWl0Q2VudGVyOiBmdW5jdGlvbiAoY2VudGVyLCB6b29tLCBib3VuZHMpIHtcclxuXHJcblx0XHRpZiAoIWJvdW5kcykgeyByZXR1cm4gY2VudGVyOyB9XHJcblxyXG5cdFx0dmFyIGNlbnRlclBvaW50ID0gdGhpcy5wcm9qZWN0KGNlbnRlciwgem9vbSksXHJcblx0XHQgICAgdmlld0hhbGYgPSB0aGlzLmdldFNpemUoKS5kaXZpZGVCeSgyKSxcclxuXHRcdCAgICB2aWV3Qm91bmRzID0gbmV3IEwuQm91bmRzKGNlbnRlclBvaW50LnN1YnRyYWN0KHZpZXdIYWxmKSwgY2VudGVyUG9pbnQuYWRkKHZpZXdIYWxmKSksXHJcblx0XHQgICAgb2Zmc2V0ID0gdGhpcy5fZ2V0Qm91bmRzT2Zmc2V0KHZpZXdCb3VuZHMsIGJvdW5kcywgem9vbSk7XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMudW5wcm9qZWN0KGNlbnRlclBvaW50LmFkZChvZmZzZXQpLCB6b29tKTtcclxuXHR9LFxyXG5cclxuXHQvLyBhZGp1c3Qgb2Zmc2V0IGZvciB2aWV3IHRvIGdldCBpbnNpZGUgYm91bmRzXHJcblx0X2xpbWl0T2Zmc2V0OiBmdW5jdGlvbiAob2Zmc2V0LCBib3VuZHMpIHtcclxuXHRcdGlmICghYm91bmRzKSB7IHJldHVybiBvZmZzZXQ7IH1cclxuXHJcblx0XHR2YXIgdmlld0JvdW5kcyA9IHRoaXMuZ2V0UGl4ZWxCb3VuZHMoKSxcclxuXHRcdCAgICBuZXdCb3VuZHMgPSBuZXcgTC5Cb3VuZHModmlld0JvdW5kcy5taW4uYWRkKG9mZnNldCksIHZpZXdCb3VuZHMubWF4LmFkZChvZmZzZXQpKTtcclxuXHJcblx0XHRyZXR1cm4gb2Zmc2V0LmFkZCh0aGlzLl9nZXRCb3VuZHNPZmZzZXQobmV3Qm91bmRzLCBib3VuZHMpKTtcclxuXHR9LFxyXG5cclxuXHQvLyByZXR1cm5zIG9mZnNldCBuZWVkZWQgZm9yIHB4Qm91bmRzIHRvIGdldCBpbnNpZGUgbWF4Qm91bmRzIGF0IGEgc3BlY2lmaWVkIHpvb21cclxuXHRfZ2V0Qm91bmRzT2Zmc2V0OiBmdW5jdGlvbiAocHhCb3VuZHMsIG1heEJvdW5kcywgem9vbSkge1xyXG5cdFx0dmFyIG53T2Zmc2V0ID0gdGhpcy5wcm9qZWN0KG1heEJvdW5kcy5nZXROb3J0aFdlc3QoKSwgem9vbSkuc3VidHJhY3QocHhCb3VuZHMubWluKSxcclxuXHRcdCAgICBzZU9mZnNldCA9IHRoaXMucHJvamVjdChtYXhCb3VuZHMuZ2V0U291dGhFYXN0KCksIHpvb20pLnN1YnRyYWN0KHB4Qm91bmRzLm1heCksXHJcblxyXG5cdFx0ICAgIGR4ID0gdGhpcy5fcmVib3VuZChud09mZnNldC54LCAtc2VPZmZzZXQueCksXHJcblx0XHQgICAgZHkgPSB0aGlzLl9yZWJvdW5kKG53T2Zmc2V0LnksIC1zZU9mZnNldC55KTtcclxuXHJcblx0XHRyZXR1cm4gbmV3IEwuUG9pbnQoZHgsIGR5KTtcclxuXHR9LFxyXG5cclxuXHRfcmVib3VuZDogZnVuY3Rpb24gKGxlZnQsIHJpZ2h0KSB7XHJcblx0XHRyZXR1cm4gbGVmdCArIHJpZ2h0ID4gMCA/XHJcblx0XHRcdE1hdGgucm91bmQobGVmdCAtIHJpZ2h0KSAvIDIgOlxyXG5cdFx0XHRNYXRoLm1heCgwLCBNYXRoLmNlaWwobGVmdCkpIC0gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcihyaWdodCkpO1xyXG5cdH0sXHJcblxyXG5cdF9saW1pdFpvb206IGZ1bmN0aW9uICh6b29tKSB7XHJcblx0XHR2YXIgbWluID0gdGhpcy5nZXRNaW5ab29tKCksXHJcblx0XHQgICAgbWF4ID0gdGhpcy5nZXRNYXhab29tKCk7XHJcblxyXG5cdFx0cmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB6b29tKSk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwubWFwID0gZnVuY3Rpb24gKGlkLCBvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLk1hcChpZCwgb3B0aW9ucyk7XHJcbn07XHJcblxuXG4vKlxyXG4gKiBNZXJjYXRvciBwcm9qZWN0aW9uIHRoYXQgdGFrZXMgaW50byBhY2NvdW50IHRoYXQgdGhlIEVhcnRoIGlzIG5vdCBhIHBlcmZlY3Qgc3BoZXJlLlxyXG4gKiBMZXNzIHBvcHVsYXIgdGhhbiBzcGhlcmljYWwgbWVyY2F0b3I7IHVzZWQgYnkgcHJvamVjdGlvbnMgbGlrZSBFUFNHOjMzOTUuXHJcbiAqL1xyXG5cclxuTC5Qcm9qZWN0aW9uLk1lcmNhdG9yID0ge1xyXG5cdE1BWF9MQVRJVFVERTogODUuMDg0MDU5MTU1NixcclxuXHJcblx0Ul9NSU5PUjogNjM1Njc1Mi4zMTQyNDUxNzksXHJcblx0Ul9NQUpPUjogNjM3ODEzNyxcclxuXHJcblx0cHJvamVjdDogZnVuY3Rpb24gKGxhdGxuZykgeyAvLyAoTGF0TG5nKSAtPiBQb2ludFxyXG5cdFx0dmFyIGQgPSBMLkxhdExuZy5ERUdfVE9fUkFELFxyXG5cdFx0ICAgIG1heCA9IHRoaXMuTUFYX0xBVElUVURFLFxyXG5cdFx0ICAgIGxhdCA9IE1hdGgubWF4KE1hdGgubWluKG1heCwgbGF0bG5nLmxhdCksIC1tYXgpLFxyXG5cdFx0ICAgIHIgPSB0aGlzLlJfTUFKT1IsXHJcblx0XHQgICAgcjIgPSB0aGlzLlJfTUlOT1IsXHJcblx0XHQgICAgeCA9IGxhdGxuZy5sbmcgKiBkICogcixcclxuXHRcdCAgICB5ID0gbGF0ICogZCxcclxuXHRcdCAgICB0bXAgPSByMiAvIHIsXHJcblx0XHQgICAgZWNjZW50ID0gTWF0aC5zcXJ0KDEuMCAtIHRtcCAqIHRtcCksXHJcblx0XHQgICAgY29uID0gZWNjZW50ICogTWF0aC5zaW4oeSk7XHJcblxyXG5cdFx0Y29uID0gTWF0aC5wb3coKDEgLSBjb24pIC8gKDEgKyBjb24pLCBlY2NlbnQgKiAwLjUpO1xyXG5cclxuXHRcdHZhciB0cyA9IE1hdGgudGFuKDAuNSAqICgoTWF0aC5QSSAqIDAuNSkgLSB5KSkgLyBjb247XHJcblx0XHR5ID0gLXIgKiBNYXRoLmxvZyh0cyk7XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBMLlBvaW50KHgsIHkpO1xyXG5cdH0sXHJcblxyXG5cdHVucHJvamVjdDogZnVuY3Rpb24gKHBvaW50KSB7IC8vIChQb2ludCwgQm9vbGVhbikgLT4gTGF0TG5nXHJcblx0XHR2YXIgZCA9IEwuTGF0TG5nLlJBRF9UT19ERUcsXHJcblx0XHQgICAgciA9IHRoaXMuUl9NQUpPUixcclxuXHRcdCAgICByMiA9IHRoaXMuUl9NSU5PUixcclxuXHRcdCAgICBsbmcgPSBwb2ludC54ICogZCAvIHIsXHJcblx0XHQgICAgdG1wID0gcjIgLyByLFxyXG5cdFx0ICAgIGVjY2VudCA9IE1hdGguc3FydCgxIC0gKHRtcCAqIHRtcCkpLFxyXG5cdFx0ICAgIHRzID0gTWF0aC5leHAoLSBwb2ludC55IC8gciksXHJcblx0XHQgICAgcGhpID0gKE1hdGguUEkgLyAyKSAtIDIgKiBNYXRoLmF0YW4odHMpLFxyXG5cdFx0ICAgIG51bUl0ZXIgPSAxNSxcclxuXHRcdCAgICB0b2wgPSAxZS03LFxyXG5cdFx0ICAgIGkgPSBudW1JdGVyLFxyXG5cdFx0ICAgIGRwaGkgPSAwLjEsXHJcblx0XHQgICAgY29uO1xyXG5cclxuXHRcdHdoaWxlICgoTWF0aC5hYnMoZHBoaSkgPiB0b2wpICYmICgtLWkgPiAwKSkge1xyXG5cdFx0XHRjb24gPSBlY2NlbnQgKiBNYXRoLnNpbihwaGkpO1xyXG5cdFx0XHRkcGhpID0gKE1hdGguUEkgLyAyKSAtIDIgKiBNYXRoLmF0YW4odHMgKlxyXG5cdFx0XHQgICAgICAgICAgICBNYXRoLnBvdygoMS4wIC0gY29uKSAvICgxLjAgKyBjb24pLCAwLjUgKiBlY2NlbnQpKSAtIHBoaTtcclxuXHRcdFx0cGhpICs9IGRwaGk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBMLkxhdExuZyhwaGkgKiBkLCBsbmcpO1xyXG5cdH1cclxufTtcclxuXG5cblxyXG5MLkNSUy5FUFNHMzM5NSA9IEwuZXh0ZW5kKHt9LCBMLkNSUywge1xyXG5cdGNvZGU6ICdFUFNHOjMzOTUnLFxyXG5cclxuXHRwcm9qZWN0aW9uOiBMLlByb2plY3Rpb24uTWVyY2F0b3IsXHJcblxyXG5cdHRyYW5zZm9ybWF0aW9uOiAoZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIG0gPSBMLlByb2plY3Rpb24uTWVyY2F0b3IsXHJcblx0XHQgICAgciA9IG0uUl9NQUpPUixcclxuXHRcdCAgICBzY2FsZSA9IDAuNSAvIChNYXRoLlBJICogcik7XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBMLlRyYW5zZm9ybWF0aW9uKHNjYWxlLCAwLjUsIC1zY2FsZSwgMC41KTtcclxuXHR9KCkpXHJcbn0pO1xyXG5cblxuLypcclxuICogTC5UaWxlTGF5ZXIgaXMgdXNlZCBmb3Igc3RhbmRhcmQgeHl6LW51bWJlcmVkIHRpbGUgbGF5ZXJzLlxyXG4gKi9cclxuXHJcbkwuVGlsZUxheWVyID0gTC5DbGFzcy5leHRlbmQoe1xyXG5cdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcclxuXHJcblx0b3B0aW9uczoge1xyXG5cdFx0bWluWm9vbTogMCxcclxuXHRcdG1heFpvb206IDE4LFxyXG5cdFx0dGlsZVNpemU6IDI1NixcclxuXHRcdHN1YmRvbWFpbnM6ICdhYmMnLFxyXG5cdFx0ZXJyb3JUaWxlVXJsOiAnJyxcclxuXHRcdGF0dHJpYnV0aW9uOiAnJyxcclxuXHRcdHpvb21PZmZzZXQ6IDAsXHJcblx0XHRvcGFjaXR5OiAxLFxyXG5cdFx0LypcclxuXHRcdG1heE5hdGl2ZVpvb206IG51bGwsXHJcblx0XHR6SW5kZXg6IG51bGwsXHJcblx0XHR0bXM6IGZhbHNlLFxyXG5cdFx0Y29udGludW91c1dvcmxkOiBmYWxzZSxcclxuXHRcdG5vV3JhcDogZmFsc2UsXHJcblx0XHR6b29tUmV2ZXJzZTogZmFsc2UsXHJcblx0XHRkZXRlY3RSZXRpbmE6IGZhbHNlLFxyXG5cdFx0cmV1c2VUaWxlczogZmFsc2UsXHJcblx0XHRib3VuZHM6IGZhbHNlLFxyXG5cdFx0Ki9cclxuXHRcdHVubG9hZEludmlzaWJsZVRpbGVzOiBMLkJyb3dzZXIubW9iaWxlLFxyXG5cdFx0dXBkYXRlV2hlbklkbGU6IEwuQnJvd3Nlci5tb2JpbGVcclxuXHR9LFxyXG5cclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAodXJsLCBvcHRpb25zKSB7XHJcblx0XHRvcHRpb25zID0gTC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xyXG5cclxuXHRcdC8vIGRldGVjdGluZyByZXRpbmEgZGlzcGxheXMsIGFkanVzdGluZyB0aWxlU2l6ZSBhbmQgem9vbSBsZXZlbHNcclxuXHRcdGlmIChvcHRpb25zLmRldGVjdFJldGluYSAmJiBMLkJyb3dzZXIucmV0aW5hICYmIG9wdGlvbnMubWF4Wm9vbSA+IDApIHtcclxuXHJcblx0XHRcdG9wdGlvbnMudGlsZVNpemUgPSBNYXRoLmZsb29yKG9wdGlvbnMudGlsZVNpemUgLyAyKTtcclxuXHRcdFx0b3B0aW9ucy56b29tT2Zmc2V0Kys7XHJcblxyXG5cdFx0XHRpZiAob3B0aW9ucy5taW5ab29tID4gMCkge1xyXG5cdFx0XHRcdG9wdGlvbnMubWluWm9vbS0tO1xyXG5cdFx0XHR9XHJcblx0XHRcdHRoaXMub3B0aW9ucy5tYXhab29tLS07XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKG9wdGlvbnMuYm91bmRzKSB7XHJcblx0XHRcdG9wdGlvbnMuYm91bmRzID0gTC5sYXRMbmdCb3VuZHMob3B0aW9ucy5ib3VuZHMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3VybCA9IHVybDtcclxuXHJcblx0XHR2YXIgc3ViZG9tYWlucyA9IHRoaXMub3B0aW9ucy5zdWJkb21haW5zO1xyXG5cclxuXHRcdGlmICh0eXBlb2Ygc3ViZG9tYWlucyA9PT0gJ3N0cmluZycpIHtcclxuXHRcdFx0dGhpcy5vcHRpb25zLnN1YmRvbWFpbnMgPSBzdWJkb21haW5zLnNwbGl0KCcnKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRvbkFkZDogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0dGhpcy5fbWFwID0gbWFwO1xyXG5cdFx0dGhpcy5fYW5pbWF0ZWQgPSBtYXAuX3pvb21BbmltYXRlZDtcclxuXHJcblx0XHQvLyBjcmVhdGUgYSBjb250YWluZXIgZGl2IGZvciB0aWxlc1xyXG5cdFx0dGhpcy5faW5pdENvbnRhaW5lcigpO1xyXG5cclxuXHRcdC8vIHNldCB1cCBldmVudHNcclxuXHRcdG1hcC5vbih7XHJcblx0XHRcdCd2aWV3cmVzZXQnOiB0aGlzLl9yZXNldCxcclxuXHRcdFx0J21vdmVlbmQnOiB0aGlzLl91cGRhdGVcclxuXHRcdH0sIHRoaXMpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9hbmltYXRlZCkge1xyXG5cdFx0XHRtYXAub24oe1xyXG5cdFx0XHRcdCd6b29tYW5pbSc6IHRoaXMuX2FuaW1hdGVab29tLFxyXG5cdFx0XHRcdCd6b29tZW5kJzogdGhpcy5fZW5kWm9vbUFuaW1cclxuXHRcdFx0fSwgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMudXBkYXRlV2hlbklkbGUpIHtcclxuXHRcdFx0dGhpcy5fbGltaXRlZFVwZGF0ZSA9IEwuVXRpbC5saW1pdEV4ZWNCeUludGVydmFsKHRoaXMuX3VwZGF0ZSwgMTUwLCB0aGlzKTtcclxuXHRcdFx0bWFwLm9uKCdtb3ZlJywgdGhpcy5fbGltaXRlZFVwZGF0ZSwgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fcmVzZXQoKTtcclxuXHRcdHRoaXMuX3VwZGF0ZSgpO1xyXG5cdH0sXHJcblxyXG5cdGFkZFRvOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXAuYWRkTGF5ZXIodGhpcyk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRvblJlbW92ZTogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0dGhpcy5fY29udGFpbmVyLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5fY29udGFpbmVyKTtcclxuXHJcblx0XHRtYXAub2ZmKHtcclxuXHRcdFx0J3ZpZXdyZXNldCc6IHRoaXMuX3Jlc2V0LFxyXG5cdFx0XHQnbW92ZWVuZCc6IHRoaXMuX3VwZGF0ZVxyXG5cdFx0fSwgdGhpcyk7XHJcblxyXG5cdFx0aWYgKHRoaXMuX2FuaW1hdGVkKSB7XHJcblx0XHRcdG1hcC5vZmYoe1xyXG5cdFx0XHRcdCd6b29tYW5pbSc6IHRoaXMuX2FuaW1hdGVab29tLFxyXG5cdFx0XHRcdCd6b29tZW5kJzogdGhpcy5fZW5kWm9vbUFuaW1cclxuXHRcdFx0fSwgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMudXBkYXRlV2hlbklkbGUpIHtcclxuXHRcdFx0bWFwLm9mZignbW92ZScsIHRoaXMuX2xpbWl0ZWRVcGRhdGUsIHRoaXMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2NvbnRhaW5lciA9IG51bGw7XHJcblx0XHR0aGlzLl9tYXAgPSBudWxsO1xyXG5cdH0sXHJcblxyXG5cdGJyaW5nVG9Gcm9udDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHBhbmUgPSB0aGlzLl9tYXAuX3BhbmVzLnRpbGVQYW5lO1xyXG5cclxuXHRcdGlmICh0aGlzLl9jb250YWluZXIpIHtcclxuXHRcdFx0cGFuZS5hcHBlbmRDaGlsZCh0aGlzLl9jb250YWluZXIpO1xyXG5cdFx0XHR0aGlzLl9zZXRBdXRvWkluZGV4KHBhbmUsIE1hdGgubWF4KTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRicmluZ1RvQmFjazogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHBhbmUgPSB0aGlzLl9tYXAuX3BhbmVzLnRpbGVQYW5lO1xyXG5cclxuXHRcdGlmICh0aGlzLl9jb250YWluZXIpIHtcclxuXHRcdFx0cGFuZS5pbnNlcnRCZWZvcmUodGhpcy5fY29udGFpbmVyLCBwYW5lLmZpcnN0Q2hpbGQpO1xyXG5cdFx0XHR0aGlzLl9zZXRBdXRvWkluZGV4KHBhbmUsIE1hdGgubWluKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRnZXRBdHRyaWJ1dGlvbjogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5hdHRyaWJ1dGlvbjtcclxuXHR9LFxyXG5cclxuXHRnZXRDb250YWluZXI6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9jb250YWluZXI7XHJcblx0fSxcclxuXHJcblx0c2V0T3BhY2l0eTogZnVuY3Rpb24gKG9wYWNpdHkpIHtcclxuXHRcdHRoaXMub3B0aW9ucy5vcGFjaXR5ID0gb3BhY2l0eTtcclxuXHJcblx0XHRpZiAodGhpcy5fbWFwKSB7XHJcblx0XHRcdHRoaXMuX3VwZGF0ZU9wYWNpdHkoKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzZXRaSW5kZXg6IGZ1bmN0aW9uICh6SW5kZXgpIHtcclxuXHRcdHRoaXMub3B0aW9ucy56SW5kZXggPSB6SW5kZXg7XHJcblx0XHR0aGlzLl91cGRhdGVaSW5kZXgoKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzZXRVcmw6IGZ1bmN0aW9uICh1cmwsIG5vUmVkcmF3KSB7XHJcblx0XHR0aGlzLl91cmwgPSB1cmw7XHJcblxyXG5cdFx0aWYgKCFub1JlZHJhdykge1xyXG5cdFx0XHR0aGlzLnJlZHJhdygpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHJlZHJhdzogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKHRoaXMuX21hcCkge1xyXG5cdFx0XHR0aGlzLl9yZXNldCh7aGFyZDogdHJ1ZX0pO1xyXG5cdFx0XHR0aGlzLl91cGRhdGUoKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdF91cGRhdGVaSW5kZXg6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9jb250YWluZXIgJiYgdGhpcy5vcHRpb25zLnpJbmRleCAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS56SW5kZXggPSB0aGlzLm9wdGlvbnMuekluZGV4O1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9zZXRBdXRvWkluZGV4OiBmdW5jdGlvbiAocGFuZSwgY29tcGFyZSkge1xyXG5cclxuXHRcdHZhciBsYXllcnMgPSBwYW5lLmNoaWxkcmVuLFxyXG5cdFx0ICAgIGVkZ2VaSW5kZXggPSAtY29tcGFyZShJbmZpbml0eSwgLUluZmluaXR5KSwgLy8gLUluZmluaXR5IGZvciBtYXgsIEluZmluaXR5IGZvciBtaW5cclxuXHRcdCAgICB6SW5kZXgsIGksIGxlbjtcclxuXHJcblx0XHRmb3IgKGkgPSAwLCBsZW4gPSBsYXllcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHJcblx0XHRcdGlmIChsYXllcnNbaV0gIT09IHRoaXMuX2NvbnRhaW5lcikge1xyXG5cdFx0XHRcdHpJbmRleCA9IHBhcnNlSW50KGxheWVyc1tpXS5zdHlsZS56SW5kZXgsIDEwKTtcclxuXHJcblx0XHRcdFx0aWYgKCFpc05hTih6SW5kZXgpKSB7XHJcblx0XHRcdFx0XHRlZGdlWkluZGV4ID0gY29tcGFyZShlZGdlWkluZGV4LCB6SW5kZXgpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMub3B0aW9ucy56SW5kZXggPSB0aGlzLl9jb250YWluZXIuc3R5bGUuekluZGV4ID1cclxuXHRcdCAgICAgICAgKGlzRmluaXRlKGVkZ2VaSW5kZXgpID8gZWRnZVpJbmRleCA6IDApICsgY29tcGFyZSgxLCAtMSk7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZU9wYWNpdHk6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBpLFxyXG5cdFx0ICAgIHRpbGVzID0gdGhpcy5fdGlsZXM7XHJcblxyXG5cdFx0aWYgKEwuQnJvd3Nlci5pZWx0OSkge1xyXG5cdFx0XHRmb3IgKGkgaW4gdGlsZXMpIHtcclxuXHRcdFx0XHRMLkRvbVV0aWwuc2V0T3BhY2l0eSh0aWxlc1tpXSwgdGhpcy5vcHRpb25zLm9wYWNpdHkpO1xyXG5cdFx0XHR9XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRMLkRvbVV0aWwuc2V0T3BhY2l0eSh0aGlzLl9jb250YWluZXIsIHRoaXMub3B0aW9ucy5vcGFjaXR5KTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfaW5pdENvbnRhaW5lcjogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHRpbGVQYW5lID0gdGhpcy5fbWFwLl9wYW5lcy50aWxlUGFuZTtcclxuXHJcblx0XHRpZiAoIXRoaXMuX2NvbnRhaW5lcikge1xyXG5cdFx0XHR0aGlzLl9jb250YWluZXIgPSBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCAnbGVhZmxldC1sYXllcicpO1xyXG5cclxuXHRcdFx0dGhpcy5fdXBkYXRlWkluZGV4KCk7XHJcblxyXG5cdFx0XHRpZiAodGhpcy5fYW5pbWF0ZWQpIHtcclxuXHRcdFx0XHR2YXIgY2xhc3NOYW1lID0gJ2xlYWZsZXQtdGlsZS1jb250YWluZXInO1xyXG5cclxuXHRcdFx0XHR0aGlzLl9iZ0J1ZmZlciA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsIGNsYXNzTmFtZSwgdGhpcy5fY29udGFpbmVyKTtcclxuXHRcdFx0XHR0aGlzLl90aWxlQ29udGFpbmVyID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgY2xhc3NOYW1lLCB0aGlzLl9jb250YWluZXIpO1xyXG5cclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHR0aGlzLl90aWxlQ29udGFpbmVyID0gdGhpcy5fY29udGFpbmVyO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHR0aWxlUGFuZS5hcHBlbmRDaGlsZCh0aGlzLl9jb250YWluZXIpO1xyXG5cclxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5vcGFjaXR5IDwgMSkge1xyXG5cdFx0XHRcdHRoaXMuX3VwZGF0ZU9wYWNpdHkoKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9yZXNldDogZnVuY3Rpb24gKGUpIHtcclxuXHRcdGZvciAodmFyIGtleSBpbiB0aGlzLl90aWxlcykge1xyXG5cdFx0XHR0aGlzLmZpcmUoJ3RpbGV1bmxvYWQnLCB7dGlsZTogdGhpcy5fdGlsZXNba2V5XX0pO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3RpbGVzID0ge307XHJcblx0XHR0aGlzLl90aWxlc1RvTG9hZCA9IDA7XHJcblxyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5yZXVzZVRpbGVzKSB7XHJcblx0XHRcdHRoaXMuX3VudXNlZFRpbGVzID0gW107XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fdGlsZUNvbnRhaW5lci5pbm5lckhUTUwgPSAnJztcclxuXHJcblx0XHRpZiAodGhpcy5fYW5pbWF0ZWQgJiYgZSAmJiBlLmhhcmQpIHtcclxuXHRcdFx0dGhpcy5fY2xlYXJCZ0J1ZmZlcigpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2luaXRDb250YWluZXIoKTtcclxuXHR9LFxyXG5cclxuXHRfZ2V0VGlsZVNpemU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBtYXAgPSB0aGlzLl9tYXAsXHJcblx0XHQgICAgem9vbSA9IG1hcC5nZXRab29tKCkgKyB0aGlzLm9wdGlvbnMuem9vbU9mZnNldCxcclxuXHRcdCAgICB6b29tTiA9IHRoaXMub3B0aW9ucy5tYXhOYXRpdmVab29tLFxyXG5cdFx0ICAgIHRpbGVTaXplID0gdGhpcy5vcHRpb25zLnRpbGVTaXplO1xyXG5cclxuXHRcdGlmICh6b29tTiAmJiB6b29tID4gem9vbU4pIHtcclxuXHRcdFx0dGlsZVNpemUgPSBNYXRoLnJvdW5kKG1hcC5nZXRab29tU2NhbGUoem9vbSkgLyBtYXAuZ2V0Wm9vbVNjYWxlKHpvb21OKSAqIHRpbGVTaXplKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGlsZVNpemU7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZTogZnVuY3Rpb24gKCkge1xyXG5cclxuXHRcdGlmICghdGhpcy5fbWFwKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdHZhciBtYXAgPSB0aGlzLl9tYXAsXHJcblx0XHQgICAgYm91bmRzID0gbWFwLmdldFBpeGVsQm91bmRzKCksXHJcblx0XHQgICAgem9vbSA9IG1hcC5nZXRab29tKCksXHJcblx0XHQgICAgdGlsZVNpemUgPSB0aGlzLl9nZXRUaWxlU2l6ZSgpO1xyXG5cclxuXHRcdGlmICh6b29tID4gdGhpcy5vcHRpb25zLm1heFpvb20gfHwgem9vbSA8IHRoaXMub3B0aW9ucy5taW5ab29tKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgdGlsZUJvdW5kcyA9IEwuYm91bmRzKFxyXG5cdFx0ICAgICAgICBib3VuZHMubWluLmRpdmlkZUJ5KHRpbGVTaXplKS5fZmxvb3IoKSxcclxuXHRcdCAgICAgICAgYm91bmRzLm1heC5kaXZpZGVCeSh0aWxlU2l6ZSkuX2Zsb29yKCkpO1xyXG5cclxuXHRcdHRoaXMuX2FkZFRpbGVzRnJvbUNlbnRlck91dCh0aWxlQm91bmRzKTtcclxuXHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnVubG9hZEludmlzaWJsZVRpbGVzIHx8IHRoaXMub3B0aW9ucy5yZXVzZVRpbGVzKSB7XHJcblx0XHRcdHRoaXMuX3JlbW92ZU90aGVyVGlsZXModGlsZUJvdW5kcyk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2FkZFRpbGVzRnJvbUNlbnRlck91dDogZnVuY3Rpb24gKGJvdW5kcykge1xyXG5cdFx0dmFyIHF1ZXVlID0gW10sXHJcblx0XHQgICAgY2VudGVyID0gYm91bmRzLmdldENlbnRlcigpO1xyXG5cclxuXHRcdHZhciBqLCBpLCBwb2ludDtcclxuXHJcblx0XHRmb3IgKGogPSBib3VuZHMubWluLnk7IGogPD0gYm91bmRzLm1heC55OyBqKyspIHtcclxuXHRcdFx0Zm9yIChpID0gYm91bmRzLm1pbi54OyBpIDw9IGJvdW5kcy5tYXgueDsgaSsrKSB7XHJcblx0XHRcdFx0cG9pbnQgPSBuZXcgTC5Qb2ludChpLCBqKTtcclxuXHJcblx0XHRcdFx0aWYgKHRoaXMuX3RpbGVTaG91bGRCZUxvYWRlZChwb2ludCkpIHtcclxuXHRcdFx0XHRcdHF1ZXVlLnB1c2gocG9pbnQpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdHZhciB0aWxlc1RvTG9hZCA9IHF1ZXVlLmxlbmd0aDtcclxuXHJcblx0XHRpZiAodGlsZXNUb0xvYWQgPT09IDApIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0Ly8gbG9hZCB0aWxlcyBpbiBvcmRlciBvZiB0aGVpciBkaXN0YW5jZSB0byBjZW50ZXJcclxuXHRcdHF1ZXVlLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHtcclxuXHRcdFx0cmV0dXJuIGEuZGlzdGFuY2VUbyhjZW50ZXIpIC0gYi5kaXN0YW5jZVRvKGNlbnRlcik7XHJcblx0XHR9KTtcclxuXHJcblx0XHR2YXIgZnJhZ21lbnQgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XHJcblxyXG5cdFx0Ly8gaWYgaXRzIHRoZSBmaXJzdCBiYXRjaCBvZiB0aWxlcyB0byBsb2FkXHJcblx0XHRpZiAoIXRoaXMuX3RpbGVzVG9Mb2FkKSB7XHJcblx0XHRcdHRoaXMuZmlyZSgnbG9hZGluZycpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3RpbGVzVG9Mb2FkICs9IHRpbGVzVG9Mb2FkO1xyXG5cclxuXHRcdGZvciAoaSA9IDA7IGkgPCB0aWxlc1RvTG9hZDsgaSsrKSB7XHJcblx0XHRcdHRoaXMuX2FkZFRpbGUocXVldWVbaV0sIGZyYWdtZW50KTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl90aWxlQ29udGFpbmVyLmFwcGVuZENoaWxkKGZyYWdtZW50KTtcclxuXHR9LFxyXG5cclxuXHRfdGlsZVNob3VsZEJlTG9hZGVkOiBmdW5jdGlvbiAodGlsZVBvaW50KSB7XHJcblx0XHRpZiAoKHRpbGVQb2ludC54ICsgJzonICsgdGlsZVBvaW50LnkpIGluIHRoaXMuX3RpbGVzKSB7XHJcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gYWxyZWFkeSBsb2FkZWRcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcclxuXHJcblx0XHRpZiAoIW9wdGlvbnMuY29udGludW91c1dvcmxkKSB7XHJcblx0XHRcdHZhciBsaW1pdCA9IHRoaXMuX2dldFdyYXBUaWxlTnVtKCk7XHJcblxyXG5cdFx0XHQvLyBkb24ndCBsb2FkIGlmIGV4Y2VlZHMgd29ybGQgYm91bmRzXHJcblx0XHRcdGlmICgob3B0aW9ucy5ub1dyYXAgJiYgKHRpbGVQb2ludC54IDwgMCB8fCB0aWxlUG9pbnQueCA+PSBsaW1pdC54KSkgfHxcclxuXHRcdFx0XHR0aWxlUG9pbnQueSA8IDAgfHwgdGlsZVBvaW50LnkgPj0gbGltaXQueSkgeyByZXR1cm4gZmFsc2U7IH1cclxuXHRcdH1cclxuXHJcblx0XHRpZiAob3B0aW9ucy5ib3VuZHMpIHtcclxuXHRcdFx0dmFyIHRpbGVTaXplID0gb3B0aW9ucy50aWxlU2l6ZSxcclxuXHRcdFx0ICAgIG53UG9pbnQgPSB0aWxlUG9pbnQubXVsdGlwbHlCeSh0aWxlU2l6ZSksXHJcblx0XHRcdCAgICBzZVBvaW50ID0gbndQb2ludC5hZGQoW3RpbGVTaXplLCB0aWxlU2l6ZV0pLFxyXG5cdFx0XHQgICAgbncgPSB0aGlzLl9tYXAudW5wcm9qZWN0KG53UG9pbnQpLFxyXG5cdFx0XHQgICAgc2UgPSB0aGlzLl9tYXAudW5wcm9qZWN0KHNlUG9pbnQpO1xyXG5cclxuXHRcdFx0Ly8gVE9ETyB0ZW1wb3JhcnkgaGFjaywgd2lsbCBiZSByZW1vdmVkIGFmdGVyIHJlZmFjdG9yaW5nIHByb2plY3Rpb25zXHJcblx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9MZWFmbGV0L0xlYWZsZXQvaXNzdWVzLzE2MThcclxuXHRcdFx0aWYgKCFvcHRpb25zLmNvbnRpbnVvdXNXb3JsZCAmJiAhb3B0aW9ucy5ub1dyYXApIHtcclxuXHRcdFx0XHRudyA9IG53LndyYXAoKTtcclxuXHRcdFx0XHRzZSA9IHNlLndyYXAoKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0aWYgKCFvcHRpb25zLmJvdW5kcy5pbnRlcnNlY3RzKFtudywgc2VdKSkgeyByZXR1cm4gZmFsc2U7IH1cclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdHJ1ZTtcclxuXHR9LFxyXG5cclxuXHRfcmVtb3ZlT3RoZXJUaWxlczogZnVuY3Rpb24gKGJvdW5kcykge1xyXG5cdFx0dmFyIGtBcnIsIHgsIHksIGtleTtcclxuXHJcblx0XHRmb3IgKGtleSBpbiB0aGlzLl90aWxlcykge1xyXG5cdFx0XHRrQXJyID0ga2V5LnNwbGl0KCc6Jyk7XHJcblx0XHRcdHggPSBwYXJzZUludChrQXJyWzBdLCAxMCk7XHJcblx0XHRcdHkgPSBwYXJzZUludChrQXJyWzFdLCAxMCk7XHJcblxyXG5cdFx0XHQvLyByZW1vdmUgdGlsZSBpZiBpdCdzIG91dCBvZiBib3VuZHNcclxuXHRcdFx0aWYgKHggPCBib3VuZHMubWluLnggfHwgeCA+IGJvdW5kcy5tYXgueCB8fCB5IDwgYm91bmRzLm1pbi55IHx8IHkgPiBib3VuZHMubWF4LnkpIHtcclxuXHRcdFx0XHR0aGlzLl9yZW1vdmVUaWxlKGtleSk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfcmVtb3ZlVGlsZTogZnVuY3Rpb24gKGtleSkge1xyXG5cdFx0dmFyIHRpbGUgPSB0aGlzLl90aWxlc1trZXldO1xyXG5cclxuXHRcdHRoaXMuZmlyZSgndGlsZXVubG9hZCcsIHt0aWxlOiB0aWxlLCB1cmw6IHRpbGUuc3JjfSk7XHJcblxyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5yZXVzZVRpbGVzKSB7XHJcblx0XHRcdEwuRG9tVXRpbC5yZW1vdmVDbGFzcyh0aWxlLCAnbGVhZmxldC10aWxlLWxvYWRlZCcpO1xyXG5cdFx0XHR0aGlzLl91bnVzZWRUaWxlcy5wdXNoKHRpbGUpO1xyXG5cclxuXHRcdH0gZWxzZSBpZiAodGlsZS5wYXJlbnROb2RlID09PSB0aGlzLl90aWxlQ29udGFpbmVyKSB7XHJcblx0XHRcdHRoaXMuX3RpbGVDb250YWluZXIucmVtb3ZlQ2hpbGQodGlsZSk7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9DbG91ZE1hZGUvTGVhZmxldC9pc3N1ZXMvMTM3XHJcblx0XHRpZiAoIUwuQnJvd3Nlci5hbmRyb2lkKSB7XHJcblx0XHRcdHRpbGUub25sb2FkID0gbnVsbDtcclxuXHRcdFx0dGlsZS5zcmMgPSBMLlV0aWwuZW1wdHlJbWFnZVVybDtcclxuXHRcdH1cclxuXHJcblx0XHRkZWxldGUgdGhpcy5fdGlsZXNba2V5XTtcclxuXHR9LFxyXG5cclxuXHRfYWRkVGlsZTogZnVuY3Rpb24gKHRpbGVQb2ludCwgY29udGFpbmVyKSB7XHJcblx0XHR2YXIgdGlsZVBvcyA9IHRoaXMuX2dldFRpbGVQb3ModGlsZVBvaW50KTtcclxuXHJcblx0XHQvLyBnZXQgdW51c2VkIHRpbGUgLSBvciBjcmVhdGUgYSBuZXcgdGlsZVxyXG5cdFx0dmFyIHRpbGUgPSB0aGlzLl9nZXRUaWxlKCk7XHJcblxyXG5cdFx0LypcclxuXHRcdENocm9tZSAyMCBsYXlvdXRzIG11Y2ggZmFzdGVyIHdpdGggdG9wL2xlZnQgKHZlcmlmeSB3aXRoIHRpbWVsaW5lLCBmcmFtZXMpXHJcblx0XHRBbmRyb2lkIDQgYnJvd3NlciBoYXMgZGlzcGxheSBpc3N1ZXMgd2l0aCB0b3AvbGVmdCBhbmQgcmVxdWlyZXMgdHJhbnNmb3JtIGluc3RlYWRcclxuXHRcdChvdGhlciBicm93c2VycyBkb24ndCBjdXJyZW50bHkgY2FyZSkgLSBzZWUgZGVidWcvaGFja3Mvaml0dGVyLmh0bWwgZm9yIGFuIGV4YW1wbGVcclxuXHRcdCovXHJcblx0XHRMLkRvbVV0aWwuc2V0UG9zaXRpb24odGlsZSwgdGlsZVBvcywgTC5Ccm93c2VyLmNocm9tZSk7XHJcblxyXG5cdFx0dGhpcy5fdGlsZXNbdGlsZVBvaW50LnggKyAnOicgKyB0aWxlUG9pbnQueV0gPSB0aWxlO1xyXG5cclxuXHRcdHRoaXMuX2xvYWRUaWxlKHRpbGUsIHRpbGVQb2ludCk7XHJcblxyXG5cdFx0aWYgKHRpbGUucGFyZW50Tm9kZSAhPT0gdGhpcy5fdGlsZUNvbnRhaW5lcikge1xyXG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGlsZSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2dldFpvb21Gb3JVcmw6IGZ1bmN0aW9uICgpIHtcclxuXHJcblx0XHR2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucyxcclxuXHRcdCAgICB6b29tID0gdGhpcy5fbWFwLmdldFpvb20oKTtcclxuXHJcblx0XHRpZiAob3B0aW9ucy56b29tUmV2ZXJzZSkge1xyXG5cdFx0XHR6b29tID0gb3B0aW9ucy5tYXhab29tIC0gem9vbTtcclxuXHRcdH1cclxuXHJcblx0XHR6b29tICs9IG9wdGlvbnMuem9vbU9mZnNldDtcclxuXHJcblx0XHRyZXR1cm4gb3B0aW9ucy5tYXhOYXRpdmVab29tID8gTWF0aC5taW4oem9vbSwgb3B0aW9ucy5tYXhOYXRpdmVab29tKSA6IHpvb207XHJcblx0fSxcclxuXHJcblx0X2dldFRpbGVQb3M6IGZ1bmN0aW9uICh0aWxlUG9pbnQpIHtcclxuXHRcdHZhciBvcmlnaW4gPSB0aGlzLl9tYXAuZ2V0UGl4ZWxPcmlnaW4oKSxcclxuXHRcdCAgICB0aWxlU2l6ZSA9IHRoaXMuX2dldFRpbGVTaXplKCk7XHJcblxyXG5cdFx0cmV0dXJuIHRpbGVQb2ludC5tdWx0aXBseUJ5KHRpbGVTaXplKS5zdWJ0cmFjdChvcmlnaW4pO1xyXG5cdH0sXHJcblxyXG5cdC8vIGltYWdlLXNwZWNpZmljIGNvZGUgKG92ZXJyaWRlIHRvIGltcGxlbWVudCBlLmcuIENhbnZhcyBvciBTVkcgdGlsZSBsYXllcilcclxuXHJcblx0Z2V0VGlsZVVybDogZnVuY3Rpb24gKHRpbGVQb2ludCkge1xyXG5cdFx0cmV0dXJuIEwuVXRpbC50ZW1wbGF0ZSh0aGlzLl91cmwsIEwuZXh0ZW5kKHtcclxuXHRcdFx0czogdGhpcy5fZ2V0U3ViZG9tYWluKHRpbGVQb2ludCksXHJcblx0XHRcdHo6IHRpbGVQb2ludC56LFxyXG5cdFx0XHR4OiB0aWxlUG9pbnQueCxcclxuXHRcdFx0eTogdGlsZVBvaW50LnlcclxuXHRcdH0sIHRoaXMub3B0aW9ucykpO1xyXG5cdH0sXHJcblxyXG5cdF9nZXRXcmFwVGlsZU51bTogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGNycyA9IHRoaXMuX21hcC5vcHRpb25zLmNycyxcclxuXHRcdCAgICBzaXplID0gY3JzLmdldFNpemUodGhpcy5fbWFwLmdldFpvb20oKSk7XHJcblx0XHRyZXR1cm4gc2l6ZS5kaXZpZGVCeSh0aGlzLl9nZXRUaWxlU2l6ZSgpKS5fZmxvb3IoKTtcclxuXHR9LFxyXG5cclxuXHRfYWRqdXN0VGlsZVBvaW50OiBmdW5jdGlvbiAodGlsZVBvaW50KSB7XHJcblxyXG5cdFx0dmFyIGxpbWl0ID0gdGhpcy5fZ2V0V3JhcFRpbGVOdW0oKTtcclxuXHJcblx0XHQvLyB3cmFwIHRpbGUgY29vcmRpbmF0ZXNcclxuXHRcdGlmICghdGhpcy5vcHRpb25zLmNvbnRpbnVvdXNXb3JsZCAmJiAhdGhpcy5vcHRpb25zLm5vV3JhcCkge1xyXG5cdFx0XHR0aWxlUG9pbnQueCA9ICgodGlsZVBvaW50LnggJSBsaW1pdC54KSArIGxpbWl0LngpICUgbGltaXQueDtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnRtcykge1xyXG5cdFx0XHR0aWxlUG9pbnQueSA9IGxpbWl0LnkgLSB0aWxlUG9pbnQueSAtIDE7XHJcblx0XHR9XHJcblxyXG5cdFx0dGlsZVBvaW50LnogPSB0aGlzLl9nZXRab29tRm9yVXJsKCk7XHJcblx0fSxcclxuXHJcblx0X2dldFN1YmRvbWFpbjogZnVuY3Rpb24gKHRpbGVQb2ludCkge1xyXG5cdFx0dmFyIGluZGV4ID0gTWF0aC5hYnModGlsZVBvaW50LnggKyB0aWxlUG9pbnQueSkgJSB0aGlzLm9wdGlvbnMuc3ViZG9tYWlucy5sZW5ndGg7XHJcblx0XHRyZXR1cm4gdGhpcy5vcHRpb25zLnN1YmRvbWFpbnNbaW5kZXhdO1xyXG5cdH0sXHJcblxyXG5cdF9nZXRUaWxlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnJldXNlVGlsZXMgJiYgdGhpcy5fdW51c2VkVGlsZXMubGVuZ3RoID4gMCkge1xyXG5cdFx0XHR2YXIgdGlsZSA9IHRoaXMuX3VudXNlZFRpbGVzLnBvcCgpO1xyXG5cdFx0XHR0aGlzLl9yZXNldFRpbGUodGlsZSk7XHJcblx0XHRcdHJldHVybiB0aWxlO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVRpbGUoKTtcclxuXHR9LFxyXG5cclxuXHQvLyBPdmVycmlkZSBpZiBkYXRhIHN0b3JlZCBvbiBhIHRpbGUgbmVlZHMgdG8gYmUgY2xlYW5lZCB1cCBiZWZvcmUgcmV1c2VcclxuXHRfcmVzZXRUaWxlOiBmdW5jdGlvbiAoLyp0aWxlKi8pIHt9LFxyXG5cclxuXHRfY3JlYXRlVGlsZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHRpbGUgPSBMLkRvbVV0aWwuY3JlYXRlKCdpbWcnLCAnbGVhZmxldC10aWxlJyk7XHJcblx0XHR0aWxlLnN0eWxlLndpZHRoID0gdGlsZS5zdHlsZS5oZWlnaHQgPSB0aGlzLl9nZXRUaWxlU2l6ZSgpICsgJ3B4JztcclxuXHRcdHRpbGUuZ2FsbGVyeWltZyA9ICdubyc7XHJcblxyXG5cdFx0dGlsZS5vbnNlbGVjdHN0YXJ0ID0gdGlsZS5vbm1vdXNlbW92ZSA9IEwuVXRpbC5mYWxzZUZuO1xyXG5cclxuXHRcdGlmIChMLkJyb3dzZXIuaWVsdDkgJiYgdGhpcy5vcHRpb25zLm9wYWNpdHkgIT09IHVuZGVmaW5lZCkge1xyXG5cdFx0XHRMLkRvbVV0aWwuc2V0T3BhY2l0eSh0aWxlLCB0aGlzLm9wdGlvbnMub3BhY2l0eSk7XHJcblx0XHR9XHJcblx0XHQvLyB3aXRob3V0IHRoaXMgaGFjaywgdGlsZXMgZGlzYXBwZWFyIGFmdGVyIHpvb20gb24gQ2hyb21lIGZvciBBbmRyb2lkXHJcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vTGVhZmxldC9MZWFmbGV0L2lzc3Vlcy8yMDc4XHJcblx0XHRpZiAoTC5Ccm93c2VyLm1vYmlsZVdlYmtpdDNkKSB7XHJcblx0XHRcdHRpbGUuc3R5bGUuV2Via2l0QmFja2ZhY2VWaXNpYmlsaXR5ID0gJ2hpZGRlbic7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGlsZTtcclxuXHR9LFxyXG5cclxuXHRfbG9hZFRpbGU6IGZ1bmN0aW9uICh0aWxlLCB0aWxlUG9pbnQpIHtcclxuXHRcdHRpbGUuX2xheWVyICA9IHRoaXM7XHJcblx0XHR0aWxlLm9ubG9hZCAgPSB0aGlzLl90aWxlT25Mb2FkO1xyXG5cdFx0dGlsZS5vbmVycm9yID0gdGhpcy5fdGlsZU9uRXJyb3I7XHJcblxyXG5cdFx0dGhpcy5fYWRqdXN0VGlsZVBvaW50KHRpbGVQb2ludCk7XHJcblx0XHR0aWxlLnNyYyAgICAgPSB0aGlzLmdldFRpbGVVcmwodGlsZVBvaW50KTtcclxuXHJcblx0XHR0aGlzLmZpcmUoJ3RpbGVsb2Fkc3RhcnQnLCB7XHJcblx0XHRcdHRpbGU6IHRpbGUsXHJcblx0XHRcdHVybDogdGlsZS5zcmNcclxuXHRcdH0pO1xyXG5cdH0sXHJcblxyXG5cdF90aWxlTG9hZGVkOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLl90aWxlc1RvTG9hZC0tO1xyXG5cclxuXHRcdGlmICh0aGlzLl9hbmltYXRlZCkge1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5fdGlsZUNvbnRhaW5lciwgJ2xlYWZsZXQtem9vbS1hbmltYXRlZCcpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICghdGhpcy5fdGlsZXNUb0xvYWQpIHtcclxuXHRcdFx0dGhpcy5maXJlKCdsb2FkJyk7XHJcblxyXG5cdFx0XHRpZiAodGhpcy5fYW5pbWF0ZWQpIHtcclxuXHRcdFx0XHQvLyBjbGVhciBzY2FsZWQgdGlsZXMgYWZ0ZXIgYWxsIG5ldyB0aWxlcyBhcmUgbG9hZGVkIChmb3IgcGVyZm9ybWFuY2UpXHJcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX2NsZWFyQmdCdWZmZXJUaW1lcik7XHJcblx0XHRcdFx0dGhpcy5fY2xlYXJCZ0J1ZmZlclRpbWVyID0gc2V0VGltZW91dChMLmJpbmQodGhpcy5fY2xlYXJCZ0J1ZmZlciwgdGhpcyksIDUwMCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfdGlsZU9uTG9hZDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGxheWVyID0gdGhpcy5fbGF5ZXI7XHJcblxyXG5cdFx0Ly9Pbmx5IGlmIHdlIGFyZSBsb2FkaW5nIGFuIGFjdHVhbCBpbWFnZVxyXG5cdFx0aWYgKHRoaXMuc3JjICE9PSBMLlV0aWwuZW1wdHlJbWFnZVVybCkge1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcywgJ2xlYWZsZXQtdGlsZS1sb2FkZWQnKTtcclxuXHJcblx0XHRcdGxheWVyLmZpcmUoJ3RpbGVsb2FkJywge1xyXG5cdFx0XHRcdHRpbGU6IHRoaXMsXHJcblx0XHRcdFx0dXJsOiB0aGlzLnNyY1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHJcblx0XHRsYXllci5fdGlsZUxvYWRlZCgpO1xyXG5cdH0sXHJcblxyXG5cdF90aWxlT25FcnJvcjogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGxheWVyID0gdGhpcy5fbGF5ZXI7XHJcblxyXG5cdFx0bGF5ZXIuZmlyZSgndGlsZWVycm9yJywge1xyXG5cdFx0XHR0aWxlOiB0aGlzLFxyXG5cdFx0XHR1cmw6IHRoaXMuc3JjXHJcblx0XHR9KTtcclxuXHJcblx0XHR2YXIgbmV3VXJsID0gbGF5ZXIub3B0aW9ucy5lcnJvclRpbGVVcmw7XHJcblx0XHRpZiAobmV3VXJsKSB7XHJcblx0XHRcdHRoaXMuc3JjID0gbmV3VXJsO1xyXG5cdFx0fVxyXG5cclxuXHRcdGxheWVyLl90aWxlTG9hZGVkKCk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwudGlsZUxheWVyID0gZnVuY3Rpb24gKHVybCwgb3B0aW9ucykge1xyXG5cdHJldHVybiBuZXcgTC5UaWxlTGF5ZXIodXJsLCBvcHRpb25zKTtcclxufTtcclxuXG5cbi8qXHJcbiAqIEwuVGlsZUxheWVyLldNUyBpcyB1c2VkIGZvciBwdXR0aW5nIFdNUyB0aWxlIGxheWVycyBvbiB0aGUgbWFwLlxyXG4gKi9cclxuXHJcbkwuVGlsZUxheWVyLldNUyA9IEwuVGlsZUxheWVyLmV4dGVuZCh7XHJcblxyXG5cdGRlZmF1bHRXbXNQYXJhbXM6IHtcclxuXHRcdHNlcnZpY2U6ICdXTVMnLFxyXG5cdFx0cmVxdWVzdDogJ0dldE1hcCcsXHJcblx0XHR2ZXJzaW9uOiAnMS4xLjEnLFxyXG5cdFx0bGF5ZXJzOiAnJyxcclxuXHRcdHN0eWxlczogJycsXHJcblx0XHRmb3JtYXQ6ICdpbWFnZS9qcGVnJyxcclxuXHRcdHRyYW5zcGFyZW50OiBmYWxzZVxyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uICh1cmwsIG9wdGlvbnMpIHsgLy8gKFN0cmluZywgT2JqZWN0KVxyXG5cclxuXHRcdHRoaXMuX3VybCA9IHVybDtcclxuXHJcblx0XHR2YXIgd21zUGFyYW1zID0gTC5leHRlbmQoe30sIHRoaXMuZGVmYXVsdFdtc1BhcmFtcyksXHJcblx0XHQgICAgdGlsZVNpemUgPSBvcHRpb25zLnRpbGVTaXplIHx8IHRoaXMub3B0aW9ucy50aWxlU2l6ZTtcclxuXHJcblx0XHRpZiAob3B0aW9ucy5kZXRlY3RSZXRpbmEgJiYgTC5Ccm93c2VyLnJldGluYSkge1xyXG5cdFx0XHR3bXNQYXJhbXMud2lkdGggPSB3bXNQYXJhbXMuaGVpZ2h0ID0gdGlsZVNpemUgKiAyO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0d21zUGFyYW1zLndpZHRoID0gd21zUGFyYW1zLmhlaWdodCA9IHRpbGVTaXplO1xyXG5cdFx0fVxyXG5cclxuXHRcdGZvciAodmFyIGkgaW4gb3B0aW9ucykge1xyXG5cdFx0XHQvLyBhbGwga2V5cyB0aGF0IGFyZSBub3QgVGlsZUxheWVyIG9wdGlvbnMgZ28gdG8gV01TIHBhcmFtc1xyXG5cdFx0XHRpZiAoIXRoaXMub3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShpKSAmJiBpICE9PSAnY3JzJykge1xyXG5cdFx0XHRcdHdtc1BhcmFtc1tpXSA9IG9wdGlvbnNbaV07XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLndtc1BhcmFtcyA9IHdtc1BhcmFtcztcclxuXHJcblx0XHRMLnNldE9wdGlvbnModGhpcywgb3B0aW9ucyk7XHJcblx0fSxcclxuXHJcblx0b25BZGQ6IGZ1bmN0aW9uIChtYXApIHtcclxuXHJcblx0XHR0aGlzLl9jcnMgPSB0aGlzLm9wdGlvbnMuY3JzIHx8IG1hcC5vcHRpb25zLmNycztcclxuXHJcblx0XHR0aGlzLl93bXNWZXJzaW9uID0gcGFyc2VGbG9hdCh0aGlzLndtc1BhcmFtcy52ZXJzaW9uKTtcclxuXHJcblx0XHR2YXIgcHJvamVjdGlvbktleSA9IHRoaXMuX3dtc1ZlcnNpb24gPj0gMS4zID8gJ2NycycgOiAnc3JzJztcclxuXHRcdHRoaXMud21zUGFyYW1zW3Byb2plY3Rpb25LZXldID0gdGhpcy5fY3JzLmNvZGU7XHJcblxyXG5cdFx0TC5UaWxlTGF5ZXIucHJvdG90eXBlLm9uQWRkLmNhbGwodGhpcywgbWFwKTtcclxuXHR9LFxyXG5cclxuXHRnZXRUaWxlVXJsOiBmdW5jdGlvbiAodGlsZVBvaW50KSB7IC8vIChQb2ludCwgTnVtYmVyKSAtPiBTdHJpbmdcclxuXHJcblx0XHR2YXIgbWFwID0gdGhpcy5fbWFwLFxyXG5cdFx0ICAgIHRpbGVTaXplID0gdGhpcy5vcHRpb25zLnRpbGVTaXplLFxyXG5cclxuXHRcdCAgICBud1BvaW50ID0gdGlsZVBvaW50Lm11bHRpcGx5QnkodGlsZVNpemUpLFxyXG5cdFx0ICAgIHNlUG9pbnQgPSBud1BvaW50LmFkZChbdGlsZVNpemUsIHRpbGVTaXplXSksXHJcblxyXG5cdFx0ICAgIG53ID0gdGhpcy5fY3JzLnByb2plY3QobWFwLnVucHJvamVjdChud1BvaW50LCB0aWxlUG9pbnQueikpLFxyXG5cdFx0ICAgIHNlID0gdGhpcy5fY3JzLnByb2plY3QobWFwLnVucHJvamVjdChzZVBvaW50LCB0aWxlUG9pbnQueikpLFxyXG5cdFx0ICAgIGJib3ggPSB0aGlzLl93bXNWZXJzaW9uID49IDEuMyAmJiB0aGlzLl9jcnMgPT09IEwuQ1JTLkVQU0c0MzI2ID9cclxuXHRcdCAgICAgICAgW3NlLnksIG53LngsIG53LnksIHNlLnhdLmpvaW4oJywnKSA6XHJcblx0XHQgICAgICAgIFtudy54LCBzZS55LCBzZS54LCBudy55XS5qb2luKCcsJyksXHJcblxyXG5cdFx0ICAgIHVybCA9IEwuVXRpbC50ZW1wbGF0ZSh0aGlzLl91cmwsIHtzOiB0aGlzLl9nZXRTdWJkb21haW4odGlsZVBvaW50KX0pO1xyXG5cclxuXHRcdHJldHVybiB1cmwgKyBMLlV0aWwuZ2V0UGFyYW1TdHJpbmcodGhpcy53bXNQYXJhbXMsIHVybCwgdHJ1ZSkgKyAnJkJCT1g9JyArIGJib3g7XHJcblx0fSxcclxuXHJcblx0c2V0UGFyYW1zOiBmdW5jdGlvbiAocGFyYW1zLCBub1JlZHJhdykge1xyXG5cclxuXHRcdEwuZXh0ZW5kKHRoaXMud21zUGFyYW1zLCBwYXJhbXMpO1xyXG5cclxuXHRcdGlmICghbm9SZWRyYXcpIHtcclxuXHRcdFx0dGhpcy5yZWRyYXcoKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9XHJcbn0pO1xyXG5cclxuTC50aWxlTGF5ZXIud21zID0gZnVuY3Rpb24gKHVybCwgb3B0aW9ucykge1xyXG5cdHJldHVybiBuZXcgTC5UaWxlTGF5ZXIuV01TKHVybCwgb3B0aW9ucyk7XHJcbn07XHJcblxuXG4vKlxyXG4gKiBMLlRpbGVMYXllci5DYW52YXMgaXMgYSBjbGFzcyB0aGF0IHlvdSBjYW4gdXNlIGFzIGEgYmFzZSBmb3IgY3JlYXRpbmdcclxuICogZHluYW1pY2FsbHkgZHJhd24gQ2FudmFzLWJhc2VkIHRpbGUgbGF5ZXJzLlxyXG4gKi9cclxuXHJcbkwuVGlsZUxheWVyLkNhbnZhcyA9IEwuVGlsZUxheWVyLmV4dGVuZCh7XHJcblx0b3B0aW9uczoge1xyXG5cdFx0YXN5bmM6IGZhbHNlXHJcblx0fSxcclxuXHJcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcclxuXHRcdEwuc2V0T3B0aW9ucyh0aGlzLCBvcHRpb25zKTtcclxuXHR9LFxyXG5cclxuXHRyZWRyYXc6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9tYXApIHtcclxuXHRcdFx0dGhpcy5fcmVzZXQoe2hhcmQ6IHRydWV9KTtcclxuXHRcdFx0dGhpcy5fdXBkYXRlKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0Zm9yICh2YXIgaSBpbiB0aGlzLl90aWxlcykge1xyXG5cdFx0XHR0aGlzLl9yZWRyYXdUaWxlKHRoaXMuX3RpbGVzW2ldKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdF9yZWRyYXdUaWxlOiBmdW5jdGlvbiAodGlsZSkge1xyXG5cdFx0dGhpcy5kcmF3VGlsZSh0aWxlLCB0aWxlLl90aWxlUG9pbnQsIHRoaXMuX21hcC5fem9vbSk7XHJcblx0fSxcclxuXHJcblx0X2NyZWF0ZVRpbGU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciB0aWxlID0gTC5Eb21VdGlsLmNyZWF0ZSgnY2FudmFzJywgJ2xlYWZsZXQtdGlsZScpO1xyXG5cdFx0dGlsZS53aWR0aCA9IHRpbGUuaGVpZ2h0ID0gdGhpcy5vcHRpb25zLnRpbGVTaXplO1xyXG5cdFx0dGlsZS5vbnNlbGVjdHN0YXJ0ID0gdGlsZS5vbm1vdXNlbW92ZSA9IEwuVXRpbC5mYWxzZUZuO1xyXG5cdFx0cmV0dXJuIHRpbGU7XHJcblx0fSxcclxuXHJcblx0X2xvYWRUaWxlOiBmdW5jdGlvbiAodGlsZSwgdGlsZVBvaW50KSB7XHJcblx0XHR0aWxlLl9sYXllciA9IHRoaXM7XHJcblx0XHR0aWxlLl90aWxlUG9pbnQgPSB0aWxlUG9pbnQ7XHJcblxyXG5cdFx0dGhpcy5fcmVkcmF3VGlsZSh0aWxlKTtcclxuXHJcblx0XHRpZiAoIXRoaXMub3B0aW9ucy5hc3luYykge1xyXG5cdFx0XHR0aGlzLnRpbGVEcmF3bih0aWxlKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRkcmF3VGlsZTogZnVuY3Rpb24gKC8qdGlsZSwgdGlsZVBvaW50Ki8pIHtcclxuXHRcdC8vIG92ZXJyaWRlIHdpdGggcmVuZGVyaW5nIGNvZGVcclxuXHR9LFxyXG5cclxuXHR0aWxlRHJhd246IGZ1bmN0aW9uICh0aWxlKSB7XHJcblx0XHR0aGlzLl90aWxlT25Mb2FkLmNhbGwodGlsZSk7XHJcblx0fVxyXG59KTtcclxuXHJcblxyXG5MLnRpbGVMYXllci5jYW52YXMgPSBmdW5jdGlvbiAob3B0aW9ucykge1xyXG5cdHJldHVybiBuZXcgTC5UaWxlTGF5ZXIuQ2FudmFzKG9wdGlvbnMpO1xyXG59O1xyXG5cblxuLypcclxuICogTC5JbWFnZU92ZXJsYXkgaXMgdXNlZCB0byBvdmVybGF5IGltYWdlcyBvdmVyIHRoZSBtYXAgKHRvIHNwZWNpZmljIGdlb2dyYXBoaWNhbCBib3VuZHMpLlxyXG4gKi9cclxuXHJcbkwuSW1hZ2VPdmVybGF5ID0gTC5DbGFzcy5leHRlbmQoe1xyXG5cdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcclxuXHJcblx0b3B0aW9uczoge1xyXG5cdFx0b3BhY2l0eTogMVxyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uICh1cmwsIGJvdW5kcywgb3B0aW9ucykgeyAvLyAoU3RyaW5nLCBMYXRMbmdCb3VuZHMsIE9iamVjdClcclxuXHRcdHRoaXMuX3VybCA9IHVybDtcclxuXHRcdHRoaXMuX2JvdW5kcyA9IEwubGF0TG5nQm91bmRzKGJvdW5kcyk7XHJcblxyXG5cdFx0TC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xyXG5cdH0sXHJcblxyXG5cdG9uQWRkOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHR0aGlzLl9tYXAgPSBtYXA7XHJcblxyXG5cdFx0aWYgKCF0aGlzLl9pbWFnZSkge1xyXG5cdFx0XHR0aGlzLl9pbml0SW1hZ2UoKTtcclxuXHRcdH1cclxuXHJcblx0XHRtYXAuX3BhbmVzLm92ZXJsYXlQYW5lLmFwcGVuZENoaWxkKHRoaXMuX2ltYWdlKTtcclxuXHJcblx0XHRtYXAub24oJ3ZpZXdyZXNldCcsIHRoaXMuX3Jlc2V0LCB0aGlzKTtcclxuXHJcblx0XHRpZiAobWFwLm9wdGlvbnMuem9vbUFuaW1hdGlvbiAmJiBMLkJyb3dzZXIuYW55M2QpIHtcclxuXHRcdFx0bWFwLm9uKCd6b29tYW5pbScsIHRoaXMuX2FuaW1hdGVab29tLCB0aGlzKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9yZXNldCgpO1xyXG5cdH0sXHJcblxyXG5cdG9uUmVtb3ZlOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXAuZ2V0UGFuZXMoKS5vdmVybGF5UGFuZS5yZW1vdmVDaGlsZCh0aGlzLl9pbWFnZSk7XHJcblxyXG5cdFx0bWFwLm9mZigndmlld3Jlc2V0JywgdGhpcy5fcmVzZXQsIHRoaXMpO1xyXG5cclxuXHRcdGlmIChtYXAub3B0aW9ucy56b29tQW5pbWF0aW9uKSB7XHJcblx0XHRcdG1hcC5vZmYoJ3pvb21hbmltJywgdGhpcy5fYW5pbWF0ZVpvb20sIHRoaXMpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGFkZFRvOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXAuYWRkTGF5ZXIodGhpcyk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzZXRPcGFjaXR5OiBmdW5jdGlvbiAob3BhY2l0eSkge1xyXG5cdFx0dGhpcy5vcHRpb25zLm9wYWNpdHkgPSBvcGFjaXR5O1xyXG5cdFx0dGhpcy5fdXBkYXRlT3BhY2l0eSgpO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0Ly8gVE9ETyByZW1vdmUgYnJpbmdUb0Zyb250L2JyaW5nVG9CYWNrIGR1cGxpY2F0aW9uIGZyb20gVGlsZUxheWVyL1BhdGhcclxuXHRicmluZ1RvRnJvbnQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9pbWFnZSkge1xyXG5cdFx0XHR0aGlzLl9tYXAuX3BhbmVzLm92ZXJsYXlQYW5lLmFwcGVuZENoaWxkKHRoaXMuX2ltYWdlKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGJyaW5nVG9CYWNrOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgcGFuZSA9IHRoaXMuX21hcC5fcGFuZXMub3ZlcmxheVBhbmU7XHJcblx0XHRpZiAodGhpcy5faW1hZ2UpIHtcclxuXHRcdFx0cGFuZS5pbnNlcnRCZWZvcmUodGhpcy5faW1hZ2UsIHBhbmUuZmlyc3RDaGlsZCk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzZXRVcmw6IGZ1bmN0aW9uICh1cmwpIHtcclxuXHRcdHRoaXMuX3VybCA9IHVybDtcclxuXHRcdHRoaXMuX2ltYWdlLnNyYyA9IHRoaXMuX3VybDtcclxuXHR9LFxyXG5cclxuXHRnZXRBdHRyaWJ1dGlvbjogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5hdHRyaWJ1dGlvbjtcclxuXHR9LFxyXG5cclxuXHRfaW5pdEltYWdlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLl9pbWFnZSA9IEwuRG9tVXRpbC5jcmVhdGUoJ2ltZycsICdsZWFmbGV0LWltYWdlLWxheWVyJyk7XHJcblxyXG5cdFx0aWYgKHRoaXMuX21hcC5vcHRpb25zLnpvb21BbmltYXRpb24gJiYgTC5Ccm93c2VyLmFueTNkKSB7XHJcblx0XHRcdEwuRG9tVXRpbC5hZGRDbGFzcyh0aGlzLl9pbWFnZSwgJ2xlYWZsZXQtem9vbS1hbmltYXRlZCcpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKHRoaXMuX2ltYWdlLCAnbGVhZmxldC16b29tLWhpZGUnKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl91cGRhdGVPcGFjaXR5KCk7XHJcblxyXG5cdFx0Ly9UT0RPIGNyZWF0ZUltYWdlIHV0aWwgbWV0aG9kIHRvIHJlbW92ZSBkdXBsaWNhdGlvblxyXG5cdFx0TC5leHRlbmQodGhpcy5faW1hZ2UsIHtcclxuXHRcdFx0Z2FsbGVyeWltZzogJ25vJyxcclxuXHRcdFx0b25zZWxlY3RzdGFydDogTC5VdGlsLmZhbHNlRm4sXHJcblx0XHRcdG9ubW91c2Vtb3ZlOiBMLlV0aWwuZmFsc2VGbixcclxuXHRcdFx0b25sb2FkOiBMLmJpbmQodGhpcy5fb25JbWFnZUxvYWQsIHRoaXMpLFxyXG5cdFx0XHRzcmM6IHRoaXMuX3VybFxyXG5cdFx0fSk7XHJcblx0fSxcclxuXHJcblx0X2FuaW1hdGVab29tOiBmdW5jdGlvbiAoZSkge1xyXG5cdFx0dmFyIG1hcCA9IHRoaXMuX21hcCxcclxuXHRcdCAgICBpbWFnZSA9IHRoaXMuX2ltYWdlLFxyXG5cdFx0ICAgIHNjYWxlID0gbWFwLmdldFpvb21TY2FsZShlLnpvb20pLFxyXG5cdFx0ICAgIG53ID0gdGhpcy5fYm91bmRzLmdldE5vcnRoV2VzdCgpLFxyXG5cdFx0ICAgIHNlID0gdGhpcy5fYm91bmRzLmdldFNvdXRoRWFzdCgpLFxyXG5cclxuXHRcdCAgICB0b3BMZWZ0ID0gbWFwLl9sYXRMbmdUb05ld0xheWVyUG9pbnQobncsIGUuem9vbSwgZS5jZW50ZXIpLFxyXG5cdFx0ICAgIHNpemUgPSBtYXAuX2xhdExuZ1RvTmV3TGF5ZXJQb2ludChzZSwgZS56b29tLCBlLmNlbnRlcikuX3N1YnRyYWN0KHRvcExlZnQpLFxyXG5cdFx0ICAgIG9yaWdpbiA9IHRvcExlZnQuX2FkZChzaXplLl9tdWx0aXBseUJ5KCgxIC8gMikgKiAoMSAtIDEgLyBzY2FsZSkpKTtcclxuXHJcblx0XHRpbWFnZS5zdHlsZVtMLkRvbVV0aWwuVFJBTlNGT1JNXSA9XHJcblx0XHQgICAgICAgIEwuRG9tVXRpbC5nZXRUcmFuc2xhdGVTdHJpbmcob3JpZ2luKSArICcgc2NhbGUoJyArIHNjYWxlICsgJykgJztcclxuXHR9LFxyXG5cclxuXHRfcmVzZXQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBpbWFnZSAgID0gdGhpcy5faW1hZ2UsXHJcblx0XHQgICAgdG9wTGVmdCA9IHRoaXMuX21hcC5sYXRMbmdUb0xheWVyUG9pbnQodGhpcy5fYm91bmRzLmdldE5vcnRoV2VzdCgpKSxcclxuXHRcdCAgICBzaXplID0gdGhpcy5fbWFwLmxhdExuZ1RvTGF5ZXJQb2ludCh0aGlzLl9ib3VuZHMuZ2V0U291dGhFYXN0KCkpLl9zdWJ0cmFjdCh0b3BMZWZ0KTtcclxuXHJcblx0XHRMLkRvbVV0aWwuc2V0UG9zaXRpb24oaW1hZ2UsIHRvcExlZnQpO1xyXG5cclxuXHRcdGltYWdlLnN0eWxlLndpZHRoICA9IHNpemUueCArICdweCc7XHJcblx0XHRpbWFnZS5zdHlsZS5oZWlnaHQgPSBzaXplLnkgKyAncHgnO1xyXG5cdH0sXHJcblxyXG5cdF9vbkltYWdlTG9hZDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpcy5maXJlKCdsb2FkJyk7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZU9wYWNpdHk6IGZ1bmN0aW9uICgpIHtcclxuXHRcdEwuRG9tVXRpbC5zZXRPcGFjaXR5KHRoaXMuX2ltYWdlLCB0aGlzLm9wdGlvbnMub3BhY2l0eSk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwuaW1hZ2VPdmVybGF5ID0gZnVuY3Rpb24gKHVybCwgYm91bmRzLCBvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLkltYWdlT3ZlcmxheSh1cmwsIGJvdW5kcywgb3B0aW9ucyk7XHJcbn07XHJcblxuXG4vKlxyXG4gKiBMLkljb24gaXMgYW4gaW1hZ2UtYmFzZWQgaWNvbiBjbGFzcyB0aGF0IHlvdSBjYW4gdXNlIHdpdGggTC5NYXJrZXIgZm9yIGN1c3RvbSBtYXJrZXJzLlxyXG4gKi9cclxuXHJcbkwuSWNvbiA9IEwuQ2xhc3MuZXh0ZW5kKHtcclxuXHRvcHRpb25zOiB7XHJcblx0XHQvKlxyXG5cdFx0aWNvblVybDogKFN0cmluZykgKHJlcXVpcmVkKVxyXG5cdFx0aWNvblJldGluYVVybDogKFN0cmluZykgKG9wdGlvbmFsLCB1c2VkIGZvciByZXRpbmEgZGV2aWNlcyBpZiBkZXRlY3RlZClcclxuXHRcdGljb25TaXplOiAoUG9pbnQpIChjYW4gYmUgc2V0IHRocm91Z2ggQ1NTKVxyXG5cdFx0aWNvbkFuY2hvcjogKFBvaW50KSAoY2VudGVyZWQgYnkgZGVmYXVsdCwgY2FuIGJlIHNldCBpbiBDU1Mgd2l0aCBuZWdhdGl2ZSBtYXJnaW5zKVxyXG5cdFx0cG9wdXBBbmNob3I6IChQb2ludCkgKGlmIG5vdCBzcGVjaWZpZWQsIHBvcHVwIG9wZW5zIGluIHRoZSBhbmNob3IgcG9pbnQpXHJcblx0XHRzaGFkb3dVcmw6IChTdHJpbmcpIChubyBzaGFkb3cgYnkgZGVmYXVsdClcclxuXHRcdHNoYWRvd1JldGluYVVybDogKFN0cmluZykgKG9wdGlvbmFsLCB1c2VkIGZvciByZXRpbmEgZGV2aWNlcyBpZiBkZXRlY3RlZClcclxuXHRcdHNoYWRvd1NpemU6IChQb2ludClcclxuXHRcdHNoYWRvd0FuY2hvcjogKFBvaW50KVxyXG5cdFx0Ki9cclxuXHRcdGNsYXNzTmFtZTogJydcclxuXHR9LFxyXG5cclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xyXG5cdFx0TC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xyXG5cdH0sXHJcblxyXG5cdGNyZWF0ZUljb246IGZ1bmN0aW9uIChvbGRJY29uKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlSWNvbignaWNvbicsIG9sZEljb24pO1xyXG5cdH0sXHJcblxyXG5cdGNyZWF0ZVNoYWRvdzogZnVuY3Rpb24gKG9sZEljb24pIHtcclxuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVJY29uKCdzaGFkb3cnLCBvbGRJY29uKTtcclxuXHR9LFxyXG5cclxuXHRfY3JlYXRlSWNvbjogZnVuY3Rpb24gKG5hbWUsIG9sZEljb24pIHtcclxuXHRcdHZhciBzcmMgPSB0aGlzLl9nZXRJY29uVXJsKG5hbWUpO1xyXG5cclxuXHRcdGlmICghc3JjKSB7XHJcblx0XHRcdGlmIChuYW1lID09PSAnaWNvbicpIHtcclxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ljb25Vcmwgbm90IHNldCBpbiBJY29uIG9wdGlvbnMgKHNlZSB0aGUgZG9jcykuJyk7XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIG51bGw7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIGltZztcclxuXHRcdGlmICghb2xkSWNvbiB8fCBvbGRJY29uLnRhZ05hbWUgIT09ICdJTUcnKSB7XHJcblx0XHRcdGltZyA9IHRoaXMuX2NyZWF0ZUltZyhzcmMpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0aW1nID0gdGhpcy5fY3JlYXRlSW1nKHNyYywgb2xkSWNvbik7XHJcblx0XHR9XHJcblx0XHR0aGlzLl9zZXRJY29uU3R5bGVzKGltZywgbmFtZSk7XHJcblxyXG5cdFx0cmV0dXJuIGltZztcclxuXHR9LFxyXG5cclxuXHRfc2V0SWNvblN0eWxlczogZnVuY3Rpb24gKGltZywgbmFtZSkge1xyXG5cdFx0dmFyIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnMsXHJcblx0XHQgICAgc2l6ZSA9IEwucG9pbnQob3B0aW9uc1tuYW1lICsgJ1NpemUnXSksXHJcblx0XHQgICAgYW5jaG9yO1xyXG5cclxuXHRcdGlmIChuYW1lID09PSAnc2hhZG93Jykge1xyXG5cdFx0XHRhbmNob3IgPSBMLnBvaW50KG9wdGlvbnMuc2hhZG93QW5jaG9yIHx8IG9wdGlvbnMuaWNvbkFuY2hvcik7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRhbmNob3IgPSBMLnBvaW50KG9wdGlvbnMuaWNvbkFuY2hvcik7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKCFhbmNob3IgJiYgc2l6ZSkge1xyXG5cdFx0XHRhbmNob3IgPSBzaXplLmRpdmlkZUJ5KDIsIHRydWUpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGltZy5jbGFzc05hbWUgPSAnbGVhZmxldC1tYXJrZXItJyArIG5hbWUgKyAnICcgKyBvcHRpb25zLmNsYXNzTmFtZTtcclxuXHJcblx0XHRpZiAoYW5jaG9yKSB7XHJcblx0XHRcdGltZy5zdHlsZS5tYXJnaW5MZWZ0ID0gKC1hbmNob3IueCkgKyAncHgnO1xyXG5cdFx0XHRpbWcuc3R5bGUubWFyZ2luVG9wICA9ICgtYW5jaG9yLnkpICsgJ3B4JztcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoc2l6ZSkge1xyXG5cdFx0XHRpbWcuc3R5bGUud2lkdGggID0gc2l6ZS54ICsgJ3B4JztcclxuXHRcdFx0aW1nLnN0eWxlLmhlaWdodCA9IHNpemUueSArICdweCc7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2NyZWF0ZUltZzogZnVuY3Rpb24gKHNyYywgZWwpIHtcclxuXHRcdGVsID0gZWwgfHwgZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW1nJyk7XHJcblx0XHRlbC5zcmMgPSBzcmM7XHJcblx0XHRyZXR1cm4gZWw7XHJcblx0fSxcclxuXHJcblx0X2dldEljb25Vcmw6IGZ1bmN0aW9uIChuYW1lKSB7XHJcblx0XHRpZiAoTC5Ccm93c2VyLnJldGluYSAmJiB0aGlzLm9wdGlvbnNbbmFtZSArICdSZXRpbmFVcmwnXSkge1xyXG5cdFx0XHRyZXR1cm4gdGhpcy5vcHRpb25zW25hbWUgKyAnUmV0aW5hVXJsJ107XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcy5vcHRpb25zW25hbWUgKyAnVXJsJ107XHJcblx0fVxyXG59KTtcclxuXHJcbkwuaWNvbiA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLkljb24ob3B0aW9ucyk7XHJcbn07XHJcblxuXG4vKlxuICogTC5JY29uLkRlZmF1bHQgaXMgdGhlIGJsdWUgbWFya2VyIGljb24gdXNlZCBieSBkZWZhdWx0IGluIExlYWZsZXQuXG4gKi9cblxuTC5JY29uLkRlZmF1bHQgPSBMLkljb24uZXh0ZW5kKHtcblxuXHRvcHRpb25zOiB7XG5cdFx0aWNvblNpemU6IFsyNSwgNDFdLFxuXHRcdGljb25BbmNob3I6IFsxMiwgNDFdLFxuXHRcdHBvcHVwQW5jaG9yOiBbMSwgLTM0XSxcblxuXHRcdHNoYWRvd1NpemU6IFs0MSwgNDFdXG5cdH0sXG5cblx0X2dldEljb25Vcmw6IGZ1bmN0aW9uIChuYW1lKSB7XG5cdFx0dmFyIGtleSA9IG5hbWUgKyAnVXJsJztcblxuXHRcdGlmICh0aGlzLm9wdGlvbnNba2V5XSkge1xuXHRcdFx0cmV0dXJuIHRoaXMub3B0aW9uc1trZXldO1xuXHRcdH1cblxuXHRcdGlmIChMLkJyb3dzZXIucmV0aW5hICYmIG5hbWUgPT09ICdpY29uJykge1xuXHRcdFx0bmFtZSArPSAnLTJ4Jztcblx0XHR9XG5cblx0XHR2YXIgcGF0aCA9IEwuSWNvbi5EZWZhdWx0LmltYWdlUGF0aDtcblxuXHRcdGlmICghcGF0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3VsZG5cXCd0IGF1dG9kZXRlY3QgTC5JY29uLkRlZmF1bHQuaW1hZ2VQYXRoLCBzZXQgaXQgbWFudWFsbHkuJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhdGggKyAnL21hcmtlci0nICsgbmFtZSArICcucG5nJztcblx0fVxufSk7XG5cbkwuSWNvbi5EZWZhdWx0LmltYWdlUGF0aCA9IChmdW5jdGlvbiAoKSB7XG5cdHZhciBzY3JpcHRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3NjcmlwdCcpLFxuXHQgICAgbGVhZmxldFJlID0gL1tcXC9eXWxlYWZsZXRbXFwtXFwuX10/KFtcXHdcXC1cXC5fXSopXFwuanNcXD8/LztcblxuXHR2YXIgaSwgbGVuLCBzcmMsIG1hdGNoZXMsIHBhdGg7XG5cblx0Zm9yIChpID0gMCwgbGVuID0gc2NyaXB0cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdHNyYyA9IHNjcmlwdHNbaV0uc3JjO1xuXHRcdG1hdGNoZXMgPSBzcmMubWF0Y2gobGVhZmxldFJlKTtcblxuXHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRwYXRoID0gc3JjLnNwbGl0KGxlYWZsZXRSZSlbMF07XG5cdFx0XHRyZXR1cm4gKHBhdGggPyBwYXRoICsgJy8nIDogJycpICsgJ2ltYWdlcyc7XG5cdFx0fVxuXHR9XG59KCkpO1xuXG5cbi8qXHJcbiAqIEwuTWFya2VyIGlzIHVzZWQgdG8gZGlzcGxheSBjbGlja2FibGUvZHJhZ2dhYmxlIGljb25zIG9uIHRoZSBtYXAuXHJcbiAqL1xyXG5cclxuTC5NYXJrZXIgPSBMLkNsYXNzLmV4dGVuZCh7XHJcblxyXG5cdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcclxuXHJcblx0b3B0aW9uczoge1xyXG5cdFx0aWNvbjogbmV3IEwuSWNvbi5EZWZhdWx0KCksXHJcblx0XHR0aXRsZTogJycsXHJcblx0XHRhbHQ6ICcnLFxyXG5cdFx0Y2xpY2thYmxlOiB0cnVlLFxyXG5cdFx0ZHJhZ2dhYmxlOiBmYWxzZSxcclxuXHRcdGtleWJvYXJkOiB0cnVlLFxyXG5cdFx0ekluZGV4T2Zmc2V0OiAwLFxyXG5cdFx0b3BhY2l0eTogMSxcclxuXHRcdHJpc2VPbkhvdmVyOiBmYWxzZSxcclxuXHRcdHJpc2VPZmZzZXQ6IDI1MFxyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChsYXRsbmcsIG9wdGlvbnMpIHtcclxuXHRcdEwuc2V0T3B0aW9ucyh0aGlzLCBvcHRpb25zKTtcclxuXHRcdHRoaXMuX2xhdGxuZyA9IEwubGF0TG5nKGxhdGxuZyk7XHJcblx0fSxcclxuXHJcblx0b25BZGQ6IGZ1bmN0aW9uIChtYXApIHtcclxuXHRcdHRoaXMuX21hcCA9IG1hcDtcclxuXHJcblx0XHRtYXAub24oJ3ZpZXdyZXNldCcsIHRoaXMudXBkYXRlLCB0aGlzKTtcclxuXHJcblx0XHR0aGlzLl9pbml0SWNvbigpO1xyXG5cdFx0dGhpcy51cGRhdGUoKTtcclxuXHRcdHRoaXMuZmlyZSgnYWRkJyk7XHJcblxyXG5cdFx0aWYgKG1hcC5vcHRpb25zLnpvb21BbmltYXRpb24gJiYgbWFwLm9wdGlvbnMubWFya2VyWm9vbUFuaW1hdGlvbikge1xyXG5cdFx0XHRtYXAub24oJ3pvb21hbmltJywgdGhpcy5fYW5pbWF0ZVpvb20sIHRoaXMpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGFkZFRvOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXAuYWRkTGF5ZXIodGhpcyk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRvblJlbW92ZTogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0aWYgKHRoaXMuZHJhZ2dpbmcpIHtcclxuXHRcdFx0dGhpcy5kcmFnZ2luZy5kaXNhYmxlKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fcmVtb3ZlSWNvbigpO1xyXG5cdFx0dGhpcy5fcmVtb3ZlU2hhZG93KCk7XHJcblxyXG5cdFx0dGhpcy5maXJlKCdyZW1vdmUnKTtcclxuXHJcblx0XHRtYXAub2ZmKHtcclxuXHRcdFx0J3ZpZXdyZXNldCc6IHRoaXMudXBkYXRlLFxyXG5cdFx0XHQnem9vbWFuaW0nOiB0aGlzLl9hbmltYXRlWm9vbVxyXG5cdFx0fSwgdGhpcyk7XHJcblxyXG5cdFx0dGhpcy5fbWFwID0gbnVsbDtcclxuXHR9LFxyXG5cclxuXHRnZXRMYXRMbmc6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9sYXRsbmc7XHJcblx0fSxcclxuXHJcblx0c2V0TGF0TG5nOiBmdW5jdGlvbiAobGF0bG5nKSB7XHJcblx0XHR0aGlzLl9sYXRsbmcgPSBMLmxhdExuZyhsYXRsbmcpO1xyXG5cclxuXHRcdHRoaXMudXBkYXRlKCk7XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuZmlyZSgnbW92ZScsIHsgbGF0bG5nOiB0aGlzLl9sYXRsbmcgfSk7XHJcblx0fSxcclxuXHJcblx0c2V0WkluZGV4T2Zmc2V0OiBmdW5jdGlvbiAob2Zmc2V0KSB7XHJcblx0XHR0aGlzLm9wdGlvbnMuekluZGV4T2Zmc2V0ID0gb2Zmc2V0O1xyXG5cdFx0dGhpcy51cGRhdGUoKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzZXRJY29uOiBmdW5jdGlvbiAoaWNvbikge1xyXG5cclxuXHRcdHRoaXMub3B0aW9ucy5pY29uID0gaWNvbjtcclxuXHJcblx0XHRpZiAodGhpcy5fbWFwKSB7XHJcblx0XHRcdHRoaXMuX2luaXRJY29uKCk7XHJcblx0XHRcdHRoaXMudXBkYXRlKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKHRoaXMuX3BvcHVwKSB7XHJcblx0XHRcdHRoaXMuYmluZFBvcHVwKHRoaXMuX3BvcHVwKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHR1cGRhdGU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9pY29uKSB7XHJcblx0XHRcdHZhciBwb3MgPSB0aGlzLl9tYXAubGF0TG5nVG9MYXllclBvaW50KHRoaXMuX2xhdGxuZykucm91bmQoKTtcclxuXHRcdFx0dGhpcy5fc2V0UG9zKHBvcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0X2luaXRJY29uOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucyxcclxuXHRcdCAgICBtYXAgPSB0aGlzLl9tYXAsXHJcblx0XHQgICAgYW5pbWF0aW9uID0gKG1hcC5vcHRpb25zLnpvb21BbmltYXRpb24gJiYgbWFwLm9wdGlvbnMubWFya2VyWm9vbUFuaW1hdGlvbiksXHJcblx0XHQgICAgY2xhc3NUb0FkZCA9IGFuaW1hdGlvbiA/ICdsZWFmbGV0LXpvb20tYW5pbWF0ZWQnIDogJ2xlYWZsZXQtem9vbS1oaWRlJztcclxuXHJcblx0XHR2YXIgaWNvbiA9IG9wdGlvbnMuaWNvbi5jcmVhdGVJY29uKHRoaXMuX2ljb24pLFxyXG5cdFx0XHRhZGRJY29uID0gZmFsc2U7XHJcblxyXG5cdFx0Ly8gaWYgd2UncmUgbm90IHJldXNpbmcgdGhlIGljb24sIHJlbW92ZSB0aGUgb2xkIG9uZSBhbmQgaW5pdCBuZXcgb25lXHJcblx0XHRpZiAoaWNvbiAhPT0gdGhpcy5faWNvbikge1xyXG5cdFx0XHRpZiAodGhpcy5faWNvbikge1xyXG5cdFx0XHRcdHRoaXMuX3JlbW92ZUljb24oKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRhZGRJY29uID0gdHJ1ZTtcclxuXHJcblx0XHRcdGlmIChvcHRpb25zLnRpdGxlKSB7XHJcblx0XHRcdFx0aWNvbi50aXRsZSA9IG9wdGlvbnMudGl0bGU7XHJcblx0XHRcdH1cclxuXHRcdFx0XHJcblx0XHRcdGlmIChvcHRpb25zLmFsdCkge1xyXG5cdFx0XHRcdGljb24uYWx0ID0gb3B0aW9ucy5hbHQ7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRMLkRvbVV0aWwuYWRkQ2xhc3MoaWNvbiwgY2xhc3NUb0FkZCk7XHJcblxyXG5cdFx0aWYgKG9wdGlvbnMua2V5Ym9hcmQpIHtcclxuXHRcdFx0aWNvbi50YWJJbmRleCA9ICcwJztcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9pY29uID0gaWNvbjtcclxuXHJcblx0XHR0aGlzLl9pbml0SW50ZXJhY3Rpb24oKTtcclxuXHJcblx0XHRpZiAob3B0aW9ucy5yaXNlT25Ib3Zlcikge1xyXG5cdFx0XHRMLkRvbUV2ZW50XHJcblx0XHRcdFx0Lm9uKGljb24sICdtb3VzZW92ZXInLCB0aGlzLl9icmluZ1RvRnJvbnQsIHRoaXMpXHJcblx0XHRcdFx0Lm9uKGljb24sICdtb3VzZW91dCcsIHRoaXMuX3Jlc2V0WkluZGV4LCB0aGlzKTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgbmV3U2hhZG93ID0gb3B0aW9ucy5pY29uLmNyZWF0ZVNoYWRvdyh0aGlzLl9zaGFkb3cpLFxyXG5cdFx0XHRhZGRTaGFkb3cgPSBmYWxzZTtcclxuXHJcblx0XHRpZiAobmV3U2hhZG93ICE9PSB0aGlzLl9zaGFkb3cpIHtcclxuXHRcdFx0dGhpcy5fcmVtb3ZlU2hhZG93KCk7XHJcblx0XHRcdGFkZFNoYWRvdyA9IHRydWU7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKG5ld1NoYWRvdykge1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3MobmV3U2hhZG93LCBjbGFzc1RvQWRkKTtcclxuXHRcdH1cclxuXHRcdHRoaXMuX3NoYWRvdyA9IG5ld1NoYWRvdztcclxuXHJcblxyXG5cdFx0aWYgKG9wdGlvbnMub3BhY2l0eSA8IDEpIHtcclxuXHRcdFx0dGhpcy5fdXBkYXRlT3BhY2l0eSgpO1xyXG5cdFx0fVxyXG5cclxuXHJcblx0XHR2YXIgcGFuZXMgPSB0aGlzLl9tYXAuX3BhbmVzO1xyXG5cclxuXHRcdGlmIChhZGRJY29uKSB7XHJcblx0XHRcdHBhbmVzLm1hcmtlclBhbmUuYXBwZW5kQ2hpbGQodGhpcy5faWNvbik7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKG5ld1NoYWRvdyAmJiBhZGRTaGFkb3cpIHtcclxuXHRcdFx0cGFuZXMuc2hhZG93UGFuZS5hcHBlbmRDaGlsZCh0aGlzLl9zaGFkb3cpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9yZW1vdmVJY29uOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnJpc2VPbkhvdmVyKSB7XHJcblx0XHRcdEwuRG9tRXZlbnRcclxuXHRcdFx0ICAgIC5vZmYodGhpcy5faWNvbiwgJ21vdXNlb3ZlcicsIHRoaXMuX2JyaW5nVG9Gcm9udClcclxuXHRcdFx0ICAgIC5vZmYodGhpcy5faWNvbiwgJ21vdXNlb3V0JywgdGhpcy5fcmVzZXRaSW5kZXgpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX21hcC5fcGFuZXMubWFya2VyUGFuZS5yZW1vdmVDaGlsZCh0aGlzLl9pY29uKTtcclxuXHJcblx0XHR0aGlzLl9pY29uID0gbnVsbDtcclxuXHR9LFxyXG5cclxuXHRfcmVtb3ZlU2hhZG93OiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fc2hhZG93KSB7XHJcblx0XHRcdHRoaXMuX21hcC5fcGFuZXMuc2hhZG93UGFuZS5yZW1vdmVDaGlsZCh0aGlzLl9zaGFkb3cpO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fc2hhZG93ID0gbnVsbDtcclxuXHR9LFxyXG5cclxuXHRfc2V0UG9zOiBmdW5jdGlvbiAocG9zKSB7XHJcblx0XHRMLkRvbVV0aWwuc2V0UG9zaXRpb24odGhpcy5faWNvbiwgcG9zKTtcclxuXHJcblx0XHRpZiAodGhpcy5fc2hhZG93KSB7XHJcblx0XHRcdEwuRG9tVXRpbC5zZXRQb3NpdGlvbih0aGlzLl9zaGFkb3csIHBvcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fekluZGV4ID0gcG9zLnkgKyB0aGlzLm9wdGlvbnMuekluZGV4T2Zmc2V0O1xyXG5cclxuXHRcdHRoaXMuX3Jlc2V0WkluZGV4KCk7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZVpJbmRleDogZnVuY3Rpb24gKG9mZnNldCkge1xyXG5cdFx0dGhpcy5faWNvbi5zdHlsZS56SW5kZXggPSB0aGlzLl96SW5kZXggKyBvZmZzZXQ7XHJcblx0fSxcclxuXHJcblx0X2FuaW1hdGVab29tOiBmdW5jdGlvbiAob3B0KSB7XHJcblx0XHR2YXIgcG9zID0gdGhpcy5fbWFwLl9sYXRMbmdUb05ld0xheWVyUG9pbnQodGhpcy5fbGF0bG5nLCBvcHQuem9vbSwgb3B0LmNlbnRlcikucm91bmQoKTtcclxuXHJcblx0XHR0aGlzLl9zZXRQb3MocG9zKTtcclxuXHR9LFxyXG5cclxuXHRfaW5pdEludGVyYWN0aW9uOiBmdW5jdGlvbiAoKSB7XHJcblxyXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMuY2xpY2thYmxlKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdC8vIFRPRE8gcmVmYWN0b3IgaW50byBzb21ldGhpbmcgc2hhcmVkIHdpdGggTWFwL1BhdGgvZXRjLiB0byBEUlkgaXQgdXBcclxuXHJcblx0XHR2YXIgaWNvbiA9IHRoaXMuX2ljb24sXHJcblx0XHQgICAgZXZlbnRzID0gWydkYmxjbGljaycsICdtb3VzZWRvd24nLCAnbW91c2VvdmVyJywgJ21vdXNlb3V0JywgJ2NvbnRleHRtZW51J107XHJcblxyXG5cdFx0TC5Eb21VdGlsLmFkZENsYXNzKGljb24sICdsZWFmbGV0LWNsaWNrYWJsZScpO1xyXG5cdFx0TC5Eb21FdmVudC5vbihpY29uLCAnY2xpY2snLCB0aGlzLl9vbk1vdXNlQ2xpY2ssIHRoaXMpO1xyXG5cdFx0TC5Eb21FdmVudC5vbihpY29uLCAna2V5cHJlc3MnLCB0aGlzLl9vbktleVByZXNzLCB0aGlzKTtcclxuXHJcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGV2ZW50cy5sZW5ndGg7IGkrKykge1xyXG5cdFx0XHRMLkRvbUV2ZW50Lm9uKGljb24sIGV2ZW50c1tpXSwgdGhpcy5fZmlyZU1vdXNlRXZlbnQsIHRoaXMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChMLkhhbmRsZXIuTWFya2VyRHJhZykge1xyXG5cdFx0XHR0aGlzLmRyYWdnaW5nID0gbmV3IEwuSGFuZGxlci5NYXJrZXJEcmFnKHRoaXMpO1xyXG5cclxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5kcmFnZ2FibGUpIHtcclxuXHRcdFx0XHR0aGlzLmRyYWdnaW5nLmVuYWJsZSgpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X29uTW91c2VDbGljazogZnVuY3Rpb24gKGUpIHtcclxuXHRcdHZhciB3YXNEcmFnZ2VkID0gdGhpcy5kcmFnZ2luZyAmJiB0aGlzLmRyYWdnaW5nLm1vdmVkKCk7XHJcblxyXG5cdFx0aWYgKHRoaXMuaGFzRXZlbnRMaXN0ZW5lcnMoZS50eXBlKSB8fCB3YXNEcmFnZ2VkKSB7XHJcblx0XHRcdEwuRG9tRXZlbnQuc3RvcFByb3BhZ2F0aW9uKGUpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICh3YXNEcmFnZ2VkKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdGlmICgoIXRoaXMuZHJhZ2dpbmcgfHwgIXRoaXMuZHJhZ2dpbmcuX2VuYWJsZWQpICYmIHRoaXMuX21hcC5kcmFnZ2luZyAmJiB0aGlzLl9tYXAuZHJhZ2dpbmcubW92ZWQoKSkgeyByZXR1cm47IH1cclxuXHJcblx0XHR0aGlzLmZpcmUoZS50eXBlLCB7XHJcblx0XHRcdG9yaWdpbmFsRXZlbnQ6IGUsXHJcblx0XHRcdGxhdGxuZzogdGhpcy5fbGF0bG5nXHJcblx0XHR9KTtcclxuXHR9LFxyXG5cclxuXHRfb25LZXlQcmVzczogZnVuY3Rpb24gKGUpIHtcclxuXHRcdGlmIChlLmtleUNvZGUgPT09IDEzKSB7XHJcblx0XHRcdHRoaXMuZmlyZSgnY2xpY2snLCB7XHJcblx0XHRcdFx0b3JpZ2luYWxFdmVudDogZSxcclxuXHRcdFx0XHRsYXRsbmc6IHRoaXMuX2xhdGxuZ1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfZmlyZU1vdXNlRXZlbnQ6IGZ1bmN0aW9uIChlKSB7XHJcblxyXG5cdFx0dGhpcy5maXJlKGUudHlwZSwge1xyXG5cdFx0XHRvcmlnaW5hbEV2ZW50OiBlLFxyXG5cdFx0XHRsYXRsbmc6IHRoaXMuX2xhdGxuZ1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0Ly8gVE9ETyBwcm9wZXIgY3VzdG9tIGV2ZW50IHByb3BhZ2F0aW9uXHJcblx0XHQvLyB0aGlzIGxpbmUgd2lsbCBhbHdheXMgYmUgY2FsbGVkIGlmIG1hcmtlciBpcyBpbiBhIEZlYXR1cmVHcm91cFxyXG5cdFx0aWYgKGUudHlwZSA9PT0gJ2NvbnRleHRtZW51JyAmJiB0aGlzLmhhc0V2ZW50TGlzdGVuZXJzKGUudHlwZSkpIHtcclxuXHRcdFx0TC5Eb21FdmVudC5wcmV2ZW50RGVmYXVsdChlKTtcclxuXHRcdH1cclxuXHRcdGlmIChlLnR5cGUgIT09ICdtb3VzZWRvd24nKSB7XHJcblx0XHRcdEwuRG9tRXZlbnQuc3RvcFByb3BhZ2F0aW9uKGUpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0TC5Eb21FdmVudC5wcmV2ZW50RGVmYXVsdChlKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRzZXRPcGFjaXR5OiBmdW5jdGlvbiAob3BhY2l0eSkge1xyXG5cdFx0dGhpcy5vcHRpb25zLm9wYWNpdHkgPSBvcGFjaXR5O1xyXG5cdFx0aWYgKHRoaXMuX21hcCkge1xyXG5cdFx0XHR0aGlzLl91cGRhdGVPcGFjaXR5KCk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZU9wYWNpdHk6IGZ1bmN0aW9uICgpIHtcclxuXHRcdEwuRG9tVXRpbC5zZXRPcGFjaXR5KHRoaXMuX2ljb24sIHRoaXMub3B0aW9ucy5vcGFjaXR5KTtcclxuXHRcdGlmICh0aGlzLl9zaGFkb3cpIHtcclxuXHRcdFx0TC5Eb21VdGlsLnNldE9wYWNpdHkodGhpcy5fc2hhZG93LCB0aGlzLm9wdGlvbnMub3BhY2l0eSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2JyaW5nVG9Gcm9udDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpcy5fdXBkYXRlWkluZGV4KHRoaXMub3B0aW9ucy5yaXNlT2Zmc2V0KTtcclxuXHR9LFxyXG5cclxuXHRfcmVzZXRaSW5kZXg6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHRoaXMuX3VwZGF0ZVpJbmRleCgwKTtcclxuXHR9XHJcbn0pO1xyXG5cclxuTC5tYXJrZXIgPSBmdW5jdGlvbiAobGF0bG5nLCBvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLk1hcmtlcihsYXRsbmcsIG9wdGlvbnMpO1xyXG59O1xyXG5cblxuLypcbiAqIEwuRGl2SWNvbiBpcyBhIGxpZ2h0d2VpZ2h0IEhUTUwtYmFzZWQgaWNvbiBjbGFzcyAoYXMgb3Bwb3NlZCB0byB0aGUgaW1hZ2UtYmFzZWQgTC5JY29uKVxuICogdG8gdXNlIHdpdGggTC5NYXJrZXIuXG4gKi9cblxuTC5EaXZJY29uID0gTC5JY29uLmV4dGVuZCh7XG5cdG9wdGlvbnM6IHtcblx0XHRpY29uU2l6ZTogWzEyLCAxMl0sIC8vIGFsc28gY2FuIGJlIHNldCB0aHJvdWdoIENTU1xuXHRcdC8qXG5cdFx0aWNvbkFuY2hvcjogKFBvaW50KVxuXHRcdHBvcHVwQW5jaG9yOiAoUG9pbnQpXG5cdFx0aHRtbDogKFN0cmluZylcblx0XHRiZ1BvczogKFBvaW50KVxuXHRcdCovXG5cdFx0Y2xhc3NOYW1lOiAnbGVhZmxldC1kaXYtaWNvbicsXG5cdFx0aHRtbDogZmFsc2Vcblx0fSxcblxuXHRjcmVhdGVJY29uOiBmdW5jdGlvbiAob2xkSWNvbikge1xuXHRcdHZhciBkaXYgPSAob2xkSWNvbiAmJiBvbGRJY29uLnRhZ05hbWUgPT09ICdESVYnKSA/IG9sZEljb24gOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcblx0XHQgICAgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcblxuXHRcdGlmIChvcHRpb25zLmh0bWwgIT09IGZhbHNlKSB7XG5cdFx0XHRkaXYuaW5uZXJIVE1MID0gb3B0aW9ucy5odG1sO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkaXYuaW5uZXJIVE1MID0gJyc7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuYmdQb3MpIHtcblx0XHRcdGRpdi5zdHlsZS5iYWNrZ3JvdW5kUG9zaXRpb24gPVxuXHRcdFx0ICAgICAgICAoLW9wdGlvbnMuYmdQb3MueCkgKyAncHggJyArICgtb3B0aW9ucy5iZ1Bvcy55KSArICdweCc7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2V0SWNvblN0eWxlcyhkaXYsICdpY29uJyk7XG5cdFx0cmV0dXJuIGRpdjtcblx0fSxcblxuXHRjcmVhdGVTaGFkb3c6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufSk7XG5cbkwuZGl2SWNvbiA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cdHJldHVybiBuZXcgTC5EaXZJY29uKG9wdGlvbnMpO1xufTtcblxuXG4vKlxyXG4gKiBMLlBvcHVwIGlzIHVzZWQgZm9yIGRpc3BsYXlpbmcgcG9wdXBzIG9uIHRoZSBtYXAuXHJcbiAqL1xyXG5cclxuTC5NYXAubWVyZ2VPcHRpb25zKHtcclxuXHRjbG9zZVBvcHVwT25DbGljazogdHJ1ZVxyXG59KTtcclxuXHJcbkwuUG9wdXAgPSBMLkNsYXNzLmV4dGVuZCh7XHJcblx0aW5jbHVkZXM6IEwuTWl4aW4uRXZlbnRzLFxyXG5cclxuXHRvcHRpb25zOiB7XHJcblx0XHRtaW5XaWR0aDogNTAsXHJcblx0XHRtYXhXaWR0aDogMzAwLFxyXG5cdFx0Ly8gbWF4SGVpZ2h0OiBudWxsLFxyXG5cdFx0YXV0b1BhbjogdHJ1ZSxcclxuXHRcdGNsb3NlQnV0dG9uOiB0cnVlLFxyXG5cdFx0b2Zmc2V0OiBbMCwgN10sXHJcblx0XHRhdXRvUGFuUGFkZGluZzogWzUsIDVdLFxyXG5cdFx0Ly8gYXV0b1BhblBhZGRpbmdUb3BMZWZ0OiBudWxsLFxyXG5cdFx0Ly8gYXV0b1BhblBhZGRpbmdCb3R0b21SaWdodDogbnVsbCxcclxuXHRcdGtlZXBJblZpZXc6IGZhbHNlLFxyXG5cdFx0Y2xhc3NOYW1lOiAnJyxcclxuXHRcdHpvb21BbmltYXRpb246IHRydWVcclxuXHR9LFxyXG5cclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucywgc291cmNlKSB7XHJcblx0XHRMLnNldE9wdGlvbnModGhpcywgb3B0aW9ucyk7XHJcblxyXG5cdFx0dGhpcy5fc291cmNlID0gc291cmNlO1xyXG5cdFx0dGhpcy5fYW5pbWF0ZWQgPSBMLkJyb3dzZXIuYW55M2QgJiYgdGhpcy5vcHRpb25zLnpvb21BbmltYXRpb247XHJcblx0XHR0aGlzLl9pc09wZW4gPSBmYWxzZTtcclxuXHR9LFxyXG5cclxuXHRvbkFkZDogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0dGhpcy5fbWFwID0gbWFwO1xyXG5cclxuXHRcdGlmICghdGhpcy5fY29udGFpbmVyKSB7XHJcblx0XHRcdHRoaXMuX2luaXRMYXlvdXQoKTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgYW5pbUZhZGUgPSBtYXAub3B0aW9ucy5mYWRlQW5pbWF0aW9uO1xyXG5cclxuXHRcdGlmIChhbmltRmFkZSkge1xyXG5cdFx0XHRMLkRvbVV0aWwuc2V0T3BhY2l0eSh0aGlzLl9jb250YWluZXIsIDApO1xyXG5cdFx0fVxyXG5cdFx0bWFwLl9wYW5lcy5wb3B1cFBhbmUuYXBwZW5kQ2hpbGQodGhpcy5fY29udGFpbmVyKTtcclxuXHJcblx0XHRtYXAub24odGhpcy5fZ2V0RXZlbnRzKCksIHRoaXMpO1xyXG5cclxuXHRcdHRoaXMudXBkYXRlKCk7XHJcblxyXG5cdFx0aWYgKGFuaW1GYWRlKSB7XHJcblx0XHRcdEwuRG9tVXRpbC5zZXRPcGFjaXR5KHRoaXMuX2NvbnRhaW5lciwgMSk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5maXJlKCdvcGVuJyk7XHJcblxyXG5cdFx0bWFwLmZpcmUoJ3BvcHVwb3BlbicsIHtwb3B1cDogdGhpc30pO1xyXG5cclxuXHRcdGlmICh0aGlzLl9zb3VyY2UpIHtcclxuXHRcdFx0dGhpcy5fc291cmNlLmZpcmUoJ3BvcHVwb3BlbicsIHtwb3B1cDogdGhpc30pO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGFkZFRvOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXAuYWRkTGF5ZXIodGhpcyk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRvcGVuT246IGZ1bmN0aW9uIChtYXApIHtcclxuXHRcdG1hcC5vcGVuUG9wdXAodGhpcyk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRvblJlbW92ZTogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0bWFwLl9wYW5lcy5wb3B1cFBhbmUucmVtb3ZlQ2hpbGQodGhpcy5fY29udGFpbmVyKTtcclxuXHJcblx0XHRMLlV0aWwuZmFsc2VGbih0aGlzLl9jb250YWluZXIub2Zmc2V0V2lkdGgpOyAvLyBmb3JjZSByZWZsb3dcclxuXHJcblx0XHRtYXAub2ZmKHRoaXMuX2dldEV2ZW50cygpLCB0aGlzKTtcclxuXHJcblx0XHRpZiAobWFwLm9wdGlvbnMuZmFkZUFuaW1hdGlvbikge1xyXG5cdFx0XHRMLkRvbVV0aWwuc2V0T3BhY2l0eSh0aGlzLl9jb250YWluZXIsIDApO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX21hcCA9IG51bGw7XHJcblxyXG5cdFx0dGhpcy5maXJlKCdjbG9zZScpO1xyXG5cclxuXHRcdG1hcC5maXJlKCdwb3B1cGNsb3NlJywge3BvcHVwOiB0aGlzfSk7XHJcblxyXG5cdFx0aWYgKHRoaXMuX3NvdXJjZSkge1xyXG5cdFx0XHR0aGlzLl9zb3VyY2UuZmlyZSgncG9wdXBjbG9zZScsIHtwb3B1cDogdGhpc30pO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGdldExhdExuZzogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX2xhdGxuZztcclxuXHR9LFxyXG5cclxuXHRzZXRMYXRMbmc6IGZ1bmN0aW9uIChsYXRsbmcpIHtcclxuXHRcdHRoaXMuX2xhdGxuZyA9IEwubGF0TG5nKGxhdGxuZyk7XHJcblx0XHRpZiAodGhpcy5fbWFwKSB7XHJcblx0XHRcdHRoaXMuX3VwZGF0ZVBvc2l0aW9uKCk7XHJcblx0XHRcdHRoaXMuX2FkanVzdFBhbigpO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0Z2V0Q29udGVudDogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRlbnQ7XHJcblx0fSxcclxuXHJcblx0c2V0Q29udGVudDogZnVuY3Rpb24gKGNvbnRlbnQpIHtcclxuXHRcdHRoaXMuX2NvbnRlbnQgPSBjb250ZW50O1xyXG5cdFx0dGhpcy51cGRhdGUoKTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHVwZGF0ZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9tYXApIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dGhpcy5fY29udGFpbmVyLnN0eWxlLnZpc2liaWxpdHkgPSAnaGlkZGVuJztcclxuXHJcblx0XHR0aGlzLl91cGRhdGVDb250ZW50KCk7XHJcblx0XHR0aGlzLl91cGRhdGVMYXlvdXQoKTtcclxuXHRcdHRoaXMuX3VwZGF0ZVBvc2l0aW9uKCk7XHJcblxyXG5cdFx0dGhpcy5fY29udGFpbmVyLnN0eWxlLnZpc2liaWxpdHkgPSAnJztcclxuXHJcblx0XHR0aGlzLl9hZGp1c3RQYW4oKTtcclxuXHR9LFxyXG5cclxuXHRfZ2V0RXZlbnRzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgZXZlbnRzID0ge1xyXG5cdFx0XHR2aWV3cmVzZXQ6IHRoaXMuX3VwZGF0ZVBvc2l0aW9uXHJcblx0XHR9O1xyXG5cclxuXHRcdGlmICh0aGlzLl9hbmltYXRlZCkge1xyXG5cdFx0XHRldmVudHMuem9vbWFuaW0gPSB0aGlzLl96b29tQW5pbWF0aW9uO1xyXG5cdFx0fVxyXG5cdFx0aWYgKCdjbG9zZU9uQ2xpY2snIGluIHRoaXMub3B0aW9ucyA/IHRoaXMub3B0aW9ucy5jbG9zZU9uQ2xpY2sgOiB0aGlzLl9tYXAub3B0aW9ucy5jbG9zZVBvcHVwT25DbGljaykge1xyXG5cdFx0XHRldmVudHMucHJlY2xpY2sgPSB0aGlzLl9jbG9zZTtcclxuXHRcdH1cclxuXHRcdGlmICh0aGlzLm9wdGlvbnMua2VlcEluVmlldykge1xyXG5cdFx0XHRldmVudHMubW92ZWVuZCA9IHRoaXMuX2FkanVzdFBhbjtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gZXZlbnRzO1xyXG5cdH0sXHJcblxyXG5cdF9jbG9zZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKHRoaXMuX21hcCkge1xyXG5cdFx0XHR0aGlzLl9tYXAuY2xvc2VQb3B1cCh0aGlzKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfaW5pdExheW91dDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHByZWZpeCA9ICdsZWFmbGV0LXBvcHVwJyxcclxuXHRcdFx0Y29udGFpbmVyQ2xhc3MgPSBwcmVmaXggKyAnICcgKyB0aGlzLm9wdGlvbnMuY2xhc3NOYW1lICsgJyBsZWFmbGV0LXpvb20tJyArXHJcblx0XHRcdCAgICAgICAgKHRoaXMuX2FuaW1hdGVkID8gJ2FuaW1hdGVkJyA6ICdoaWRlJyksXHJcblx0XHRcdGNvbnRhaW5lciA9IHRoaXMuX2NvbnRhaW5lciA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsIGNvbnRhaW5lckNsYXNzKSxcclxuXHRcdFx0Y2xvc2VCdXR0b247XHJcblxyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5jbG9zZUJ1dHRvbikge1xyXG5cdFx0XHRjbG9zZUJ1dHRvbiA9IHRoaXMuX2Nsb3NlQnV0dG9uID1cclxuXHRcdFx0ICAgICAgICBMLkRvbVV0aWwuY3JlYXRlKCdhJywgcHJlZml4ICsgJy1jbG9zZS1idXR0b24nLCBjb250YWluZXIpO1xyXG5cdFx0XHRjbG9zZUJ1dHRvbi5ocmVmID0gJyNjbG9zZSc7XHJcblx0XHRcdGNsb3NlQnV0dG9uLmlubmVySFRNTCA9ICcmIzIxNTsnO1xyXG5cdFx0XHRMLkRvbUV2ZW50LmRpc2FibGVDbGlja1Byb3BhZ2F0aW9uKGNsb3NlQnV0dG9uKTtcclxuXHJcblx0XHRcdEwuRG9tRXZlbnQub24oY2xvc2VCdXR0b24sICdjbGljaycsIHRoaXMuX29uQ2xvc2VCdXR0b25DbGljaywgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIHdyYXBwZXIgPSB0aGlzLl93cmFwcGVyID1cclxuXHRcdCAgICAgICAgTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgcHJlZml4ICsgJy1jb250ZW50LXdyYXBwZXInLCBjb250YWluZXIpO1xyXG5cdFx0TC5Eb21FdmVudC5kaXNhYmxlQ2xpY2tQcm9wYWdhdGlvbih3cmFwcGVyKTtcclxuXHJcblx0XHR0aGlzLl9jb250ZW50Tm9kZSA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsIHByZWZpeCArICctY29udGVudCcsIHdyYXBwZXIpO1xyXG5cclxuXHRcdEwuRG9tRXZlbnQuZGlzYWJsZVNjcm9sbFByb3BhZ2F0aW9uKHRoaXMuX2NvbnRlbnROb2RlKTtcclxuXHRcdEwuRG9tRXZlbnQub24od3JhcHBlciwgJ2NvbnRleHRtZW51JywgTC5Eb21FdmVudC5zdG9wUHJvcGFnYXRpb24pO1xyXG5cclxuXHRcdHRoaXMuX3RpcENvbnRhaW5lciA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsIHByZWZpeCArICctdGlwLWNvbnRhaW5lcicsIGNvbnRhaW5lcik7XHJcblx0XHR0aGlzLl90aXAgPSBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCBwcmVmaXggKyAnLXRpcCcsIHRoaXMuX3RpcENvbnRhaW5lcik7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZUNvbnRlbnQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICghdGhpcy5fY29udGVudCkgeyByZXR1cm47IH1cclxuXHJcblx0XHRpZiAodHlwZW9mIHRoaXMuX2NvbnRlbnQgPT09ICdzdHJpbmcnKSB7XHJcblx0XHRcdHRoaXMuX2NvbnRlbnROb2RlLmlubmVySFRNTCA9IHRoaXMuX2NvbnRlbnQ7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR3aGlsZSAodGhpcy5fY29udGVudE5vZGUuaGFzQ2hpbGROb2RlcygpKSB7XHJcblx0XHRcdFx0dGhpcy5fY29udGVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5fY29udGVudE5vZGUuZmlyc3RDaGlsZCk7XHJcblx0XHRcdH1cclxuXHRcdFx0dGhpcy5fY29udGVudE5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fY29udGVudCk7XHJcblx0XHR9XHJcblx0XHR0aGlzLmZpcmUoJ2NvbnRlbnR1cGRhdGUnKTtcclxuXHR9LFxyXG5cclxuXHRfdXBkYXRlTGF5b3V0OiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgY29udGFpbmVyID0gdGhpcy5fY29udGVudE5vZGUsXHJcblx0XHQgICAgc3R5bGUgPSBjb250YWluZXIuc3R5bGU7XHJcblxyXG5cdFx0c3R5bGUud2lkdGggPSAnJztcclxuXHRcdHN0eWxlLndoaXRlU3BhY2UgPSAnbm93cmFwJztcclxuXHJcblx0XHR2YXIgd2lkdGggPSBjb250YWluZXIub2Zmc2V0V2lkdGg7XHJcblx0XHR3aWR0aCA9IE1hdGgubWluKHdpZHRoLCB0aGlzLm9wdGlvbnMubWF4V2lkdGgpO1xyXG5cdFx0d2lkdGggPSBNYXRoLm1heCh3aWR0aCwgdGhpcy5vcHRpb25zLm1pbldpZHRoKTtcclxuXHJcblx0XHRzdHlsZS53aWR0aCA9ICh3aWR0aCArIDEpICsgJ3B4JztcclxuXHRcdHN0eWxlLndoaXRlU3BhY2UgPSAnJztcclxuXHJcblx0XHRzdHlsZS5oZWlnaHQgPSAnJztcclxuXHJcblx0XHR2YXIgaGVpZ2h0ID0gY29udGFpbmVyLm9mZnNldEhlaWdodCxcclxuXHRcdCAgICBtYXhIZWlnaHQgPSB0aGlzLm9wdGlvbnMubWF4SGVpZ2h0LFxyXG5cdFx0ICAgIHNjcm9sbGVkQ2xhc3MgPSAnbGVhZmxldC1wb3B1cC1zY3JvbGxlZCc7XHJcblxyXG5cdFx0aWYgKG1heEhlaWdodCAmJiBoZWlnaHQgPiBtYXhIZWlnaHQpIHtcclxuXHRcdFx0c3R5bGUuaGVpZ2h0ID0gbWF4SGVpZ2h0ICsgJ3B4JztcclxuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKGNvbnRhaW5lciwgc2Nyb2xsZWRDbGFzcyk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRMLkRvbVV0aWwucmVtb3ZlQ2xhc3MoY29udGFpbmVyLCBzY3JvbGxlZENsYXNzKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9jb250YWluZXJXaWR0aCA9IHRoaXMuX2NvbnRhaW5lci5vZmZzZXRXaWR0aDtcclxuXHR9LFxyXG5cclxuXHRfdXBkYXRlUG9zaXRpb246IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICghdGhpcy5fbWFwKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdHZhciBwb3MgPSB0aGlzLl9tYXAubGF0TG5nVG9MYXllclBvaW50KHRoaXMuX2xhdGxuZyksXHJcblx0XHQgICAgYW5pbWF0ZWQgPSB0aGlzLl9hbmltYXRlZCxcclxuXHRcdCAgICBvZmZzZXQgPSBMLnBvaW50KHRoaXMub3B0aW9ucy5vZmZzZXQpO1xyXG5cclxuXHRcdGlmIChhbmltYXRlZCkge1xyXG5cdFx0XHRMLkRvbVV0aWwuc2V0UG9zaXRpb24odGhpcy5fY29udGFpbmVyLCBwb3MpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2NvbnRhaW5lckJvdHRvbSA9IC1vZmZzZXQueSAtIChhbmltYXRlZCA/IDAgOiBwb3MueSk7XHJcblx0XHR0aGlzLl9jb250YWluZXJMZWZ0ID0gLU1hdGgucm91bmQodGhpcy5fY29udGFpbmVyV2lkdGggLyAyKSArIG9mZnNldC54ICsgKGFuaW1hdGVkID8gMCA6IHBvcy54KTtcclxuXHJcblx0XHQvLyBib3R0b20gcG9zaXRpb24gdGhlIHBvcHVwIGluIGNhc2UgdGhlIGhlaWdodCBvZiB0aGUgcG9wdXAgY2hhbmdlcyAoaW1hZ2VzIGxvYWRpbmcgZXRjKVxyXG5cdFx0dGhpcy5fY29udGFpbmVyLnN0eWxlLmJvdHRvbSA9IHRoaXMuX2NvbnRhaW5lckJvdHRvbSArICdweCc7XHJcblx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUubGVmdCA9IHRoaXMuX2NvbnRhaW5lckxlZnQgKyAncHgnO1xyXG5cdH0sXHJcblxyXG5cdF96b29tQW5pbWF0aW9uOiBmdW5jdGlvbiAob3B0KSB7XHJcblx0XHR2YXIgcG9zID0gdGhpcy5fbWFwLl9sYXRMbmdUb05ld0xheWVyUG9pbnQodGhpcy5fbGF0bG5nLCBvcHQuem9vbSwgb3B0LmNlbnRlcik7XHJcblxyXG5cdFx0TC5Eb21VdGlsLnNldFBvc2l0aW9uKHRoaXMuX2NvbnRhaW5lciwgcG9zKTtcclxuXHR9LFxyXG5cclxuXHRfYWRqdXN0UGFuOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAoIXRoaXMub3B0aW9ucy5hdXRvUGFuKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdHZhciBtYXAgPSB0aGlzLl9tYXAsXHJcblx0XHQgICAgY29udGFpbmVySGVpZ2h0ID0gdGhpcy5fY29udGFpbmVyLm9mZnNldEhlaWdodCxcclxuXHRcdCAgICBjb250YWluZXJXaWR0aCA9IHRoaXMuX2NvbnRhaW5lcldpZHRoLFxyXG5cclxuXHRcdCAgICBsYXllclBvcyA9IG5ldyBMLlBvaW50KHRoaXMuX2NvbnRhaW5lckxlZnQsIC1jb250YWluZXJIZWlnaHQgLSB0aGlzLl9jb250YWluZXJCb3R0b20pO1xyXG5cclxuXHRcdGlmICh0aGlzLl9hbmltYXRlZCkge1xyXG5cdFx0XHRsYXllclBvcy5fYWRkKEwuRG9tVXRpbC5nZXRQb3NpdGlvbih0aGlzLl9jb250YWluZXIpKTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgY29udGFpbmVyUG9zID0gbWFwLmxheWVyUG9pbnRUb0NvbnRhaW5lclBvaW50KGxheWVyUG9zKSxcclxuXHRcdCAgICBwYWRkaW5nID0gTC5wb2ludCh0aGlzLm9wdGlvbnMuYXV0b1BhblBhZGRpbmcpLFxyXG5cdFx0ICAgIHBhZGRpbmdUTCA9IEwucG9pbnQodGhpcy5vcHRpb25zLmF1dG9QYW5QYWRkaW5nVG9wTGVmdCB8fCBwYWRkaW5nKSxcclxuXHRcdCAgICBwYWRkaW5nQlIgPSBMLnBvaW50KHRoaXMub3B0aW9ucy5hdXRvUGFuUGFkZGluZ0JvdHRvbVJpZ2h0IHx8IHBhZGRpbmcpLFxyXG5cdFx0ICAgIHNpemUgPSBtYXAuZ2V0U2l6ZSgpLFxyXG5cdFx0ICAgIGR4ID0gMCxcclxuXHRcdCAgICBkeSA9IDA7XHJcblxyXG5cdFx0aWYgKGNvbnRhaW5lclBvcy54ICsgY29udGFpbmVyV2lkdGggKyBwYWRkaW5nQlIueCA+IHNpemUueCkgeyAvLyByaWdodFxyXG5cdFx0XHRkeCA9IGNvbnRhaW5lclBvcy54ICsgY29udGFpbmVyV2lkdGggLSBzaXplLnggKyBwYWRkaW5nQlIueDtcclxuXHRcdH1cclxuXHRcdGlmIChjb250YWluZXJQb3MueCAtIGR4IC0gcGFkZGluZ1RMLnggPCAwKSB7IC8vIGxlZnRcclxuXHRcdFx0ZHggPSBjb250YWluZXJQb3MueCAtIHBhZGRpbmdUTC54O1xyXG5cdFx0fVxyXG5cdFx0aWYgKGNvbnRhaW5lclBvcy55ICsgY29udGFpbmVySGVpZ2h0ICsgcGFkZGluZ0JSLnkgPiBzaXplLnkpIHsgLy8gYm90dG9tXHJcblx0XHRcdGR5ID0gY29udGFpbmVyUG9zLnkgKyBjb250YWluZXJIZWlnaHQgLSBzaXplLnkgKyBwYWRkaW5nQlIueTtcclxuXHRcdH1cclxuXHRcdGlmIChjb250YWluZXJQb3MueSAtIGR5IC0gcGFkZGluZ1RMLnkgPCAwKSB7IC8vIHRvcFxyXG5cdFx0XHRkeSA9IGNvbnRhaW5lclBvcy55IC0gcGFkZGluZ1RMLnk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKGR4IHx8IGR5KSB7XHJcblx0XHRcdG1hcFxyXG5cdFx0XHQgICAgLmZpcmUoJ2F1dG9wYW5zdGFydCcpXHJcblx0XHRcdCAgICAucGFuQnkoW2R4LCBkeV0pO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9vbkNsb3NlQnV0dG9uQ2xpY2s6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHR0aGlzLl9jbG9zZSgpO1xyXG5cdFx0TC5Eb21FdmVudC5zdG9wKGUpO1xyXG5cdH1cclxufSk7XHJcblxyXG5MLnBvcHVwID0gZnVuY3Rpb24gKG9wdGlvbnMsIHNvdXJjZSkge1xyXG5cdHJldHVybiBuZXcgTC5Qb3B1cChvcHRpb25zLCBzb3VyY2UpO1xyXG59O1xyXG5cclxuXHJcbkwuTWFwLmluY2x1ZGUoe1xyXG5cdG9wZW5Qb3B1cDogZnVuY3Rpb24gKHBvcHVwLCBsYXRsbmcsIG9wdGlvbnMpIHsgLy8gKFBvcHVwKSBvciAoU3RyaW5nIHx8IEhUTUxFbGVtZW50LCBMYXRMbmdbLCBPYmplY3RdKVxyXG5cdFx0dGhpcy5jbG9zZVBvcHVwKCk7XHJcblxyXG5cdFx0aWYgKCEocG9wdXAgaW5zdGFuY2VvZiBMLlBvcHVwKSkge1xyXG5cdFx0XHR2YXIgY29udGVudCA9IHBvcHVwO1xyXG5cclxuXHRcdFx0cG9wdXAgPSBuZXcgTC5Qb3B1cChvcHRpb25zKVxyXG5cdFx0XHQgICAgLnNldExhdExuZyhsYXRsbmcpXHJcblx0XHRcdCAgICAuc2V0Q29udGVudChjb250ZW50KTtcclxuXHRcdH1cclxuXHRcdHBvcHVwLl9pc09wZW4gPSB0cnVlO1xyXG5cclxuXHRcdHRoaXMuX3BvcHVwID0gcG9wdXA7XHJcblx0XHRyZXR1cm4gdGhpcy5hZGRMYXllcihwb3B1cCk7XHJcblx0fSxcclxuXHJcblx0Y2xvc2VQb3B1cDogZnVuY3Rpb24gKHBvcHVwKSB7XHJcblx0XHRpZiAoIXBvcHVwIHx8IHBvcHVwID09PSB0aGlzLl9wb3B1cCkge1xyXG5cdFx0XHRwb3B1cCA9IHRoaXMuX3BvcHVwO1xyXG5cdFx0XHR0aGlzLl9wb3B1cCA9IG51bGw7XHJcblx0XHR9XHJcblx0XHRpZiAocG9wdXApIHtcclxuXHRcdFx0dGhpcy5yZW1vdmVMYXllcihwb3B1cCk7XHJcblx0XHRcdHBvcHVwLl9pc09wZW4gPSBmYWxzZTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH1cclxufSk7XHJcblxuXG4vKlxyXG4gKiBQb3B1cCBleHRlbnNpb24gdG8gTC5NYXJrZXIsIGFkZGluZyBwb3B1cC1yZWxhdGVkIG1ldGhvZHMuXHJcbiAqL1xyXG5cclxuTC5NYXJrZXIuaW5jbHVkZSh7XHJcblx0b3BlblBvcHVwOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fcG9wdXAgJiYgdGhpcy5fbWFwICYmICF0aGlzLl9tYXAuaGFzTGF5ZXIodGhpcy5fcG9wdXApKSB7XHJcblx0XHRcdHRoaXMuX3BvcHVwLnNldExhdExuZyh0aGlzLl9sYXRsbmcpO1xyXG5cdFx0XHR0aGlzLl9tYXAub3BlblBvcHVwKHRoaXMuX3BvcHVwKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRjbG9zZVBvcHVwOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fcG9wdXApIHtcclxuXHRcdFx0dGhpcy5fcG9wdXAuX2Nsb3NlKCk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHR0b2dnbGVQb3B1cDogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKHRoaXMuX3BvcHVwKSB7XHJcblx0XHRcdGlmICh0aGlzLl9wb3B1cC5faXNPcGVuKSB7XHJcblx0XHRcdFx0dGhpcy5jbG9zZVBvcHVwKCk7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0dGhpcy5vcGVuUG9wdXAoKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0YmluZFBvcHVwOiBmdW5jdGlvbiAoY29udGVudCwgb3B0aW9ucykge1xyXG5cdFx0dmFyIGFuY2hvciA9IEwucG9pbnQodGhpcy5vcHRpb25zLmljb24ub3B0aW9ucy5wb3B1cEFuY2hvciB8fCBbMCwgMF0pO1xyXG5cclxuXHRcdGFuY2hvciA9IGFuY2hvci5hZGQoTC5Qb3B1cC5wcm90b3R5cGUub3B0aW9ucy5vZmZzZXQpO1xyXG5cclxuXHRcdGlmIChvcHRpb25zICYmIG9wdGlvbnMub2Zmc2V0KSB7XHJcblx0XHRcdGFuY2hvciA9IGFuY2hvci5hZGQob3B0aW9ucy5vZmZzZXQpO1xyXG5cdFx0fVxyXG5cclxuXHRcdG9wdGlvbnMgPSBMLmV4dGVuZCh7b2Zmc2V0OiBhbmNob3J9LCBvcHRpb25zKTtcclxuXHJcblx0XHRpZiAoIXRoaXMuX3BvcHVwSGFuZGxlcnNBZGRlZCkge1xyXG5cdFx0XHR0aGlzXHJcblx0XHRcdCAgICAub24oJ2NsaWNrJywgdGhpcy50b2dnbGVQb3B1cCwgdGhpcylcclxuXHRcdFx0ICAgIC5vbigncmVtb3ZlJywgdGhpcy5jbG9zZVBvcHVwLCB0aGlzKVxyXG5cdFx0XHQgICAgLm9uKCdtb3ZlJywgdGhpcy5fbW92ZVBvcHVwLCB0aGlzKTtcclxuXHRcdFx0dGhpcy5fcG9wdXBIYW5kbGVyc0FkZGVkID0gdHJ1ZTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoY29udGVudCBpbnN0YW5jZW9mIEwuUG9wdXApIHtcclxuXHRcdFx0TC5zZXRPcHRpb25zKGNvbnRlbnQsIG9wdGlvbnMpO1xyXG5cdFx0XHR0aGlzLl9wb3B1cCA9IGNvbnRlbnQ7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0aGlzLl9wb3B1cCA9IG5ldyBMLlBvcHVwKG9wdGlvbnMsIHRoaXMpXHJcblx0XHRcdFx0LnNldENvbnRlbnQoY29udGVudCk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0c2V0UG9wdXBDb250ZW50OiBmdW5jdGlvbiAoY29udGVudCkge1xyXG5cdFx0aWYgKHRoaXMuX3BvcHVwKSB7XHJcblx0XHRcdHRoaXMuX3BvcHVwLnNldENvbnRlbnQoY29udGVudCk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHR1bmJpbmRQb3B1cDogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKHRoaXMuX3BvcHVwKSB7XHJcblx0XHRcdHRoaXMuX3BvcHVwID0gbnVsbDtcclxuXHRcdFx0dGhpc1xyXG5cdFx0XHQgICAgLm9mZignY2xpY2snLCB0aGlzLnRvZ2dsZVBvcHVwLCB0aGlzKVxyXG5cdFx0XHQgICAgLm9mZigncmVtb3ZlJywgdGhpcy5jbG9zZVBvcHVwLCB0aGlzKVxyXG5cdFx0XHQgICAgLm9mZignbW92ZScsIHRoaXMuX21vdmVQb3B1cCwgdGhpcyk7XHJcblx0XHRcdHRoaXMuX3BvcHVwSGFuZGxlcnNBZGRlZCA9IGZhbHNlO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0Z2V0UG9wdXA6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9wb3B1cDtcclxuXHR9LFxyXG5cclxuXHRfbW92ZVBvcHVwOiBmdW5jdGlvbiAoZSkge1xyXG5cdFx0dGhpcy5fcG9wdXAuc2V0TGF0TG5nKGUubGF0bG5nKTtcclxuXHR9XHJcbn0pO1xyXG5cblxuLypcclxuICogTC5MYXllckdyb3VwIGlzIGEgY2xhc3MgdG8gY29tYmluZSBzZXZlcmFsIGxheWVycyBpbnRvIG9uZSBzbyB0aGF0XHJcbiAqIHlvdSBjYW4gbWFuaXB1bGF0ZSB0aGUgZ3JvdXAgKGUuZy4gYWRkL3JlbW92ZSBpdCkgYXMgb25lIGxheWVyLlxyXG4gKi9cclxuXHJcbkwuTGF5ZXJHcm91cCA9IEwuQ2xhc3MuZXh0ZW5kKHtcclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAobGF5ZXJzKSB7XHJcblx0XHR0aGlzLl9sYXllcnMgPSB7fTtcclxuXHJcblx0XHR2YXIgaSwgbGVuO1xyXG5cclxuXHRcdGlmIChsYXllcnMpIHtcclxuXHRcdFx0Zm9yIChpID0gMCwgbGVuID0gbGF5ZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdFx0dGhpcy5hZGRMYXllcihsYXllcnNbaV0pO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0YWRkTGF5ZXI6IGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0dmFyIGlkID0gdGhpcy5nZXRMYXllcklkKGxheWVyKTtcclxuXHJcblx0XHR0aGlzLl9sYXllcnNbaWRdID0gbGF5ZXI7XHJcblxyXG5cdFx0aWYgKHRoaXMuX21hcCkge1xyXG5cdFx0XHR0aGlzLl9tYXAuYWRkTGF5ZXIobGF5ZXIpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHJlbW92ZUxheWVyOiBmdW5jdGlvbiAobGF5ZXIpIHtcclxuXHRcdHZhciBpZCA9IGxheWVyIGluIHRoaXMuX2xheWVycyA/IGxheWVyIDogdGhpcy5nZXRMYXllcklkKGxheWVyKTtcclxuXHJcblx0XHRpZiAodGhpcy5fbWFwICYmIHRoaXMuX2xheWVyc1tpZF0pIHtcclxuXHRcdFx0dGhpcy5fbWFwLnJlbW92ZUxheWVyKHRoaXMuX2xheWVyc1tpZF0pO1xyXG5cdFx0fVxyXG5cclxuXHRcdGRlbGV0ZSB0aGlzLl9sYXllcnNbaWRdO1xyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGhhc0xheWVyOiBmdW5jdGlvbiAobGF5ZXIpIHtcclxuXHRcdGlmICghbGF5ZXIpIHsgcmV0dXJuIGZhbHNlOyB9XHJcblxyXG5cdFx0cmV0dXJuIChsYXllciBpbiB0aGlzLl9sYXllcnMgfHwgdGhpcy5nZXRMYXllcklkKGxheWVyKSBpbiB0aGlzLl9sYXllcnMpO1xyXG5cdH0sXHJcblxyXG5cdGNsZWFyTGF5ZXJzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLmVhY2hMYXllcih0aGlzLnJlbW92ZUxheWVyLCB0aGlzKTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGludm9rZTogZnVuY3Rpb24gKG1ldGhvZE5hbWUpIHtcclxuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSxcclxuXHRcdCAgICBpLCBsYXllcjtcclxuXHJcblx0XHRmb3IgKGkgaW4gdGhpcy5fbGF5ZXJzKSB7XHJcblx0XHRcdGxheWVyID0gdGhpcy5fbGF5ZXJzW2ldO1xyXG5cclxuXHRcdFx0aWYgKGxheWVyW21ldGhvZE5hbWVdKSB7XHJcblx0XHRcdFx0bGF5ZXJbbWV0aG9kTmFtZV0uYXBwbHkobGF5ZXIsIGFyZ3MpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0b25BZGQ6IGZ1bmN0aW9uIChtYXApIHtcclxuXHRcdHRoaXMuX21hcCA9IG1hcDtcclxuXHRcdHRoaXMuZWFjaExheWVyKG1hcC5hZGRMYXllciwgbWFwKTtcclxuXHR9LFxyXG5cclxuXHRvblJlbW92ZTogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0dGhpcy5lYWNoTGF5ZXIobWFwLnJlbW92ZUxheWVyLCBtYXApO1xyXG5cdFx0dGhpcy5fbWFwID0gbnVsbDtcclxuXHR9LFxyXG5cclxuXHRhZGRUbzogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0bWFwLmFkZExheWVyKHRoaXMpO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0ZWFjaExheWVyOiBmdW5jdGlvbiAobWV0aG9kLCBjb250ZXh0KSB7XHJcblx0XHRmb3IgKHZhciBpIGluIHRoaXMuX2xheWVycykge1xyXG5cdFx0XHRtZXRob2QuY2FsbChjb250ZXh0LCB0aGlzLl9sYXllcnNbaV0pO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0Z2V0TGF5ZXI6IGZ1bmN0aW9uIChpZCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX2xheWVyc1tpZF07XHJcblx0fSxcclxuXHJcblx0Z2V0TGF5ZXJzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgbGF5ZXJzID0gW107XHJcblxyXG5cdFx0Zm9yICh2YXIgaSBpbiB0aGlzLl9sYXllcnMpIHtcclxuXHRcdFx0bGF5ZXJzLnB1c2godGhpcy5fbGF5ZXJzW2ldKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiBsYXllcnM7XHJcblx0fSxcclxuXHJcblx0c2V0WkluZGV4OiBmdW5jdGlvbiAoekluZGV4KSB7XHJcblx0XHRyZXR1cm4gdGhpcy5pbnZva2UoJ3NldFpJbmRleCcsIHpJbmRleCk7XHJcblx0fSxcclxuXHJcblx0Z2V0TGF5ZXJJZDogZnVuY3Rpb24gKGxheWVyKSB7XHJcblx0XHRyZXR1cm4gTC5zdGFtcChsYXllcik7XHJcblx0fVxyXG59KTtcclxuXHJcbkwubGF5ZXJHcm91cCA9IGZ1bmN0aW9uIChsYXllcnMpIHtcclxuXHRyZXR1cm4gbmV3IEwuTGF5ZXJHcm91cChsYXllcnMpO1xyXG59O1xyXG5cblxuLypcclxuICogTC5GZWF0dXJlR3JvdXAgZXh0ZW5kcyBMLkxheWVyR3JvdXAgYnkgaW50cm9kdWNpbmcgbW91c2UgZXZlbnRzIGFuZCBhZGRpdGlvbmFsIG1ldGhvZHNcclxuICogc2hhcmVkIGJldHdlZW4gYSBncm91cCBvZiBpbnRlcmFjdGl2ZSBsYXllcnMgKGxpa2UgdmVjdG9ycyBvciBtYXJrZXJzKS5cclxuICovXHJcblxyXG5MLkZlYXR1cmVHcm91cCA9IEwuTGF5ZXJHcm91cC5leHRlbmQoe1xyXG5cdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcclxuXHJcblx0c3RhdGljczoge1xyXG5cdFx0RVZFTlRTOiAnY2xpY2sgZGJsY2xpY2sgbW91c2VvdmVyIG1vdXNlb3V0IG1vdXNlbW92ZSBjb250ZXh0bWVudSBwb3B1cG9wZW4gcG9wdXBjbG9zZSdcclxuXHR9LFxyXG5cclxuXHRhZGRMYXllcjogZnVuY3Rpb24gKGxheWVyKSB7XHJcblx0XHRpZiAodGhpcy5oYXNMYXllcihsYXllcikpIHtcclxuXHRcdFx0cmV0dXJuIHRoaXM7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKCdvbicgaW4gbGF5ZXIpIHtcclxuXHRcdFx0bGF5ZXIub24oTC5GZWF0dXJlR3JvdXAuRVZFTlRTLCB0aGlzLl9wcm9wYWdhdGVFdmVudCwgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0TC5MYXllckdyb3VwLnByb3RvdHlwZS5hZGRMYXllci5jYWxsKHRoaXMsIGxheWVyKTtcclxuXHJcblx0XHRpZiAodGhpcy5fcG9wdXBDb250ZW50ICYmIGxheWVyLmJpbmRQb3B1cCkge1xyXG5cdFx0XHRsYXllci5iaW5kUG9wdXAodGhpcy5fcG9wdXBDb250ZW50LCB0aGlzLl9wb3B1cE9wdGlvbnMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzLmZpcmUoJ2xheWVyYWRkJywge2xheWVyOiBsYXllcn0pO1xyXG5cdH0sXHJcblxyXG5cdHJlbW92ZUxheWVyOiBmdW5jdGlvbiAobGF5ZXIpIHtcclxuXHRcdGlmICghdGhpcy5oYXNMYXllcihsYXllcikpIHtcclxuXHRcdFx0cmV0dXJuIHRoaXM7XHJcblx0XHR9XHJcblx0XHRpZiAobGF5ZXIgaW4gdGhpcy5fbGF5ZXJzKSB7XHJcblx0XHRcdGxheWVyID0gdGhpcy5fbGF5ZXJzW2xheWVyXTtcclxuXHRcdH1cclxuXHJcblx0XHRsYXllci5vZmYoTC5GZWF0dXJlR3JvdXAuRVZFTlRTLCB0aGlzLl9wcm9wYWdhdGVFdmVudCwgdGhpcyk7XHJcblxyXG5cdFx0TC5MYXllckdyb3VwLnByb3RvdHlwZS5yZW1vdmVMYXllci5jYWxsKHRoaXMsIGxheWVyKTtcclxuXHJcblx0XHRpZiAodGhpcy5fcG9wdXBDb250ZW50KSB7XHJcblx0XHRcdHRoaXMuaW52b2tlKCd1bmJpbmRQb3B1cCcpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzLmZpcmUoJ2xheWVycmVtb3ZlJywge2xheWVyOiBsYXllcn0pO1xyXG5cdH0sXHJcblxyXG5cdGJpbmRQb3B1cDogZnVuY3Rpb24gKGNvbnRlbnQsIG9wdGlvbnMpIHtcclxuXHRcdHRoaXMuX3BvcHVwQ29udGVudCA9IGNvbnRlbnQ7XHJcblx0XHR0aGlzLl9wb3B1cE9wdGlvbnMgPSBvcHRpb25zO1xyXG5cdFx0cmV0dXJuIHRoaXMuaW52b2tlKCdiaW5kUG9wdXAnLCBjb250ZW50LCBvcHRpb25zKTtcclxuXHR9LFxyXG5cclxuXHRvcGVuUG9wdXA6IGZ1bmN0aW9uIChsYXRsbmcpIHtcclxuXHRcdC8vIG9wZW4gcG9wdXAgb24gdGhlIGZpcnN0IGxheWVyXHJcblx0XHRmb3IgKHZhciBpZCBpbiB0aGlzLl9sYXllcnMpIHtcclxuXHRcdFx0dGhpcy5fbGF5ZXJzW2lkXS5vcGVuUG9wdXAobGF0bG5nKTtcclxuXHRcdFx0YnJlYWs7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzZXRTdHlsZTogZnVuY3Rpb24gKHN0eWxlKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5pbnZva2UoJ3NldFN0eWxlJywgc3R5bGUpO1xyXG5cdH0sXHJcblxyXG5cdGJyaW5nVG9Gcm9udDogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuaW52b2tlKCdicmluZ1RvRnJvbnQnKTtcclxuXHR9LFxyXG5cclxuXHRicmluZ1RvQmFjazogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuaW52b2tlKCdicmluZ1RvQmFjaycpO1xyXG5cdH0sXHJcblxyXG5cdGdldEJvdW5kczogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGJvdW5kcyA9IG5ldyBMLkxhdExuZ0JvdW5kcygpO1xyXG5cclxuXHRcdHRoaXMuZWFjaExheWVyKGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0XHRib3VuZHMuZXh0ZW5kKGxheWVyIGluc3RhbmNlb2YgTC5NYXJrZXIgPyBsYXllci5nZXRMYXRMbmcoKSA6IGxheWVyLmdldEJvdW5kcygpKTtcclxuXHRcdH0pO1xyXG5cclxuXHRcdHJldHVybiBib3VuZHM7XHJcblx0fSxcclxuXHJcblx0X3Byb3BhZ2F0ZUV2ZW50OiBmdW5jdGlvbiAoZSkge1xyXG5cdFx0ZSA9IEwuZXh0ZW5kKHtcclxuXHRcdFx0bGF5ZXI6IGUudGFyZ2V0LFxyXG5cdFx0XHR0YXJnZXQ6IHRoaXNcclxuXHRcdH0sIGUpO1xyXG5cdFx0dGhpcy5maXJlKGUudHlwZSwgZSk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwuZmVhdHVyZUdyb3VwID0gZnVuY3Rpb24gKGxheWVycykge1xyXG5cdHJldHVybiBuZXcgTC5GZWF0dXJlR3JvdXAobGF5ZXJzKTtcclxufTtcclxuXG5cbi8qXHJcbiAqIEwuUGF0aCBpcyBhIGJhc2UgY2xhc3MgZm9yIHJlbmRlcmluZyB2ZWN0b3IgcGF0aHMgb24gYSBtYXAuIEluaGVyaXRlZCBieSBQb2x5bGluZSwgQ2lyY2xlLCBldGMuXHJcbiAqL1xyXG5cclxuTC5QYXRoID0gTC5DbGFzcy5leHRlbmQoe1xyXG5cdGluY2x1ZGVzOiBbTC5NaXhpbi5FdmVudHNdLFxyXG5cclxuXHRzdGF0aWNzOiB7XHJcblx0XHQvLyBob3cgbXVjaCB0byBleHRlbmQgdGhlIGNsaXAgYXJlYSBhcm91bmQgdGhlIG1hcCB2aWV3XHJcblx0XHQvLyAocmVsYXRpdmUgdG8gaXRzIHNpemUsIGUuZy4gMC41IGlzIGhhbGYgdGhlIHNjcmVlbiBpbiBlYWNoIGRpcmVjdGlvbilcclxuXHRcdC8vIHNldCBpdCBzbyB0aGF0IFNWRyBlbGVtZW50IGRvZXNuJ3QgZXhjZWVkIDEyODBweCAodmVjdG9ycyBmbGlja2VyIG9uIGRyYWdlbmQgaWYgaXQgaXMpXHJcblx0XHRDTElQX1BBRERJTkc6IChmdW5jdGlvbiAoKSB7XHJcblx0XHRcdHZhciBtYXggPSBMLkJyb3dzZXIubW9iaWxlID8gMTI4MCA6IDIwMDAsXHJcblx0XHRcdCAgICB0YXJnZXQgPSAobWF4IC8gTWF0aC5tYXgod2luZG93Lm91dGVyV2lkdGgsIHdpbmRvdy5vdXRlckhlaWdodCkgLSAxKSAvIDI7XHJcblx0XHRcdHJldHVybiBNYXRoLm1heCgwLCBNYXRoLm1pbigwLjUsIHRhcmdldCkpO1xyXG5cdFx0fSkoKVxyXG5cdH0sXHJcblxyXG5cdG9wdGlvbnM6IHtcclxuXHRcdHN0cm9rZTogdHJ1ZSxcclxuXHRcdGNvbG9yOiAnIzAwMzNmZicsXHJcblx0XHRkYXNoQXJyYXk6IG51bGwsXHJcblx0XHRsaW5lQ2FwOiBudWxsLFxyXG5cdFx0bGluZUpvaW46IG51bGwsXHJcblx0XHR3ZWlnaHQ6IDUsXHJcblx0XHRvcGFjaXR5OiAwLjUsXHJcblxyXG5cdFx0ZmlsbDogZmFsc2UsXHJcblx0XHRmaWxsQ29sb3I6IG51bGwsIC8vc2FtZSBhcyBjb2xvciBieSBkZWZhdWx0XHJcblx0XHRmaWxsT3BhY2l0eTogMC4yLFxyXG5cclxuXHRcdGNsaWNrYWJsZTogdHJ1ZVxyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XHJcblx0XHRMLnNldE9wdGlvbnModGhpcywgb3B0aW9ucyk7XHJcblx0fSxcclxuXHJcblx0b25BZGQ6IGZ1bmN0aW9uIChtYXApIHtcclxuXHRcdHRoaXMuX21hcCA9IG1hcDtcclxuXHJcblx0XHRpZiAoIXRoaXMuX2NvbnRhaW5lcikge1xyXG5cdFx0XHR0aGlzLl9pbml0RWxlbWVudHMoKTtcclxuXHRcdFx0dGhpcy5faW5pdEV2ZW50cygpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMucHJvamVjdExhdGxuZ3MoKTtcclxuXHRcdHRoaXMuX3VwZGF0ZVBhdGgoKTtcclxuXHJcblx0XHRpZiAodGhpcy5fY29udGFpbmVyKSB7XHJcblx0XHRcdHRoaXMuX21hcC5fcGF0aFJvb3QuYXBwZW5kQ2hpbGQodGhpcy5fY29udGFpbmVyKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLmZpcmUoJ2FkZCcpO1xyXG5cclxuXHRcdG1hcC5vbih7XHJcblx0XHRcdCd2aWV3cmVzZXQnOiB0aGlzLnByb2plY3RMYXRsbmdzLFxyXG5cdFx0XHQnbW92ZWVuZCc6IHRoaXMuX3VwZGF0ZVBhdGhcclxuXHRcdH0sIHRoaXMpO1xyXG5cdH0sXHJcblxyXG5cdGFkZFRvOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXAuYWRkTGF5ZXIodGhpcyk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRvblJlbW92ZTogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0bWFwLl9wYXRoUm9vdC5yZW1vdmVDaGlsZCh0aGlzLl9jb250YWluZXIpO1xyXG5cclxuXHRcdC8vIE5lZWQgdG8gZmlyZSByZW1vdmUgZXZlbnQgYmVmb3JlIHdlIHNldCBfbWFwIHRvIG51bGwgYXMgdGhlIGV2ZW50IGhvb2tzIG1pZ2h0IG5lZWQgdGhlIG9iamVjdFxyXG5cdFx0dGhpcy5maXJlKCdyZW1vdmUnKTtcclxuXHRcdHRoaXMuX21hcCA9IG51bGw7XHJcblxyXG5cdFx0aWYgKEwuQnJvd3Nlci52bWwpIHtcclxuXHRcdFx0dGhpcy5fY29udGFpbmVyID0gbnVsbDtcclxuXHRcdFx0dGhpcy5fc3Ryb2tlID0gbnVsbDtcclxuXHRcdFx0dGhpcy5fZmlsbCA9IG51bGw7XHJcblx0XHR9XHJcblxyXG5cdFx0bWFwLm9mZih7XHJcblx0XHRcdCd2aWV3cmVzZXQnOiB0aGlzLnByb2plY3RMYXRsbmdzLFxyXG5cdFx0XHQnbW92ZWVuZCc6IHRoaXMuX3VwZGF0ZVBhdGhcclxuXHRcdH0sIHRoaXMpO1xyXG5cdH0sXHJcblxyXG5cdHByb2plY3RMYXRsbmdzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHQvLyBkbyBhbGwgcHJvamVjdGlvbiBzdHVmZiBoZXJlXHJcblx0fSxcclxuXHJcblx0c2V0U3R5bGU6IGZ1bmN0aW9uIChzdHlsZSkge1xyXG5cdFx0TC5zZXRPcHRpb25zKHRoaXMsIHN0eWxlKTtcclxuXHJcblx0XHRpZiAodGhpcy5fY29udGFpbmVyKSB7XHJcblx0XHRcdHRoaXMuX3VwZGF0ZVN0eWxlKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cmVkcmF3OiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fbWFwKSB7XHJcblx0XHRcdHRoaXMucHJvamVjdExhdGxuZ3MoKTtcclxuXHRcdFx0dGhpcy5fdXBkYXRlUGF0aCgpO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fVxyXG59KTtcclxuXHJcbkwuTWFwLmluY2x1ZGUoe1xyXG5cdF91cGRhdGVQYXRoVmlld3BvcnQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBwID0gTC5QYXRoLkNMSVBfUEFERElORyxcclxuXHRcdCAgICBzaXplID0gdGhpcy5nZXRTaXplKCksXHJcblx0XHQgICAgcGFuZVBvcyA9IEwuRG9tVXRpbC5nZXRQb3NpdGlvbih0aGlzLl9tYXBQYW5lKSxcclxuXHRcdCAgICBtaW4gPSBwYW5lUG9zLm11bHRpcGx5QnkoLTEpLl9zdWJ0cmFjdChzaXplLm11bHRpcGx5QnkocCkuX3JvdW5kKCkpLFxyXG5cdFx0ICAgIG1heCA9IG1pbi5hZGQoc2l6ZS5tdWx0aXBseUJ5KDEgKyBwICogMikuX3JvdW5kKCkpO1xyXG5cclxuXHRcdHRoaXMuX3BhdGhWaWV3cG9ydCA9IG5ldyBMLkJvdW5kcyhtaW4sIG1heCk7XHJcblx0fVxyXG59KTtcclxuXG5cbi8qXHJcbiAqIEV4dGVuZHMgTC5QYXRoIHdpdGggU1ZHLXNwZWNpZmljIHJlbmRlcmluZyBjb2RlLlxyXG4gKi9cclxuXHJcbkwuUGF0aC5TVkdfTlMgPSAnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnO1xyXG5cclxuTC5Ccm93c2VyLnN2ZyA9ICEhKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyAmJiBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoTC5QYXRoLlNWR19OUywgJ3N2ZycpLmNyZWF0ZVNWR1JlY3QpO1xyXG5cclxuTC5QYXRoID0gTC5QYXRoLmV4dGVuZCh7XHJcblx0c3RhdGljczoge1xyXG5cdFx0U1ZHOiBMLkJyb3dzZXIuc3ZnXHJcblx0fSxcclxuXHJcblx0YnJpbmdUb0Zyb250OiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgcm9vdCA9IHRoaXMuX21hcC5fcGF0aFJvb3QsXHJcblx0XHQgICAgcGF0aCA9IHRoaXMuX2NvbnRhaW5lcjtcclxuXHJcblx0XHRpZiAocGF0aCAmJiByb290Lmxhc3RDaGlsZCAhPT0gcGF0aCkge1xyXG5cdFx0XHRyb290LmFwcGVuZENoaWxkKHBhdGgpO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0YnJpbmdUb0JhY2s6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciByb290ID0gdGhpcy5fbWFwLl9wYXRoUm9vdCxcclxuXHRcdCAgICBwYXRoID0gdGhpcy5fY29udGFpbmVyLFxyXG5cdFx0ICAgIGZpcnN0ID0gcm9vdC5maXJzdENoaWxkO1xyXG5cclxuXHRcdGlmIChwYXRoICYmIGZpcnN0ICE9PSBwYXRoKSB7XHJcblx0XHRcdHJvb3QuaW5zZXJ0QmVmb3JlKHBhdGgsIGZpcnN0KTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGdldFBhdGhTdHJpbmc6IGZ1bmN0aW9uICgpIHtcclxuXHRcdC8vIGZvcm0gcGF0aCBzdHJpbmcgaGVyZVxyXG5cdH0sXHJcblxyXG5cdF9jcmVhdGVFbGVtZW50OiBmdW5jdGlvbiAobmFtZSkge1xyXG5cdFx0cmV0dXJuIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhMLlBhdGguU1ZHX05TLCBuYW1lKTtcclxuXHR9LFxyXG5cclxuXHRfaW5pdEVsZW1lbnRzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLl9tYXAuX2luaXRQYXRoUm9vdCgpO1xyXG5cdFx0dGhpcy5faW5pdFBhdGgoKTtcclxuXHRcdHRoaXMuX2luaXRTdHlsZSgpO1xyXG5cdH0sXHJcblxyXG5cdF9pbml0UGF0aDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpcy5fY29udGFpbmVyID0gdGhpcy5fY3JlYXRlRWxlbWVudCgnZycpO1xyXG5cclxuXHRcdHRoaXMuX3BhdGggPSB0aGlzLl9jcmVhdGVFbGVtZW50KCdwYXRoJyk7XHJcblxyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5jbGFzc05hbWUpIHtcclxuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKHRoaXMuX3BhdGgsIHRoaXMub3B0aW9ucy5jbGFzc05hbWUpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9wYXRoKTtcclxuXHR9LFxyXG5cclxuXHRfaW5pdFN0eWxlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnN0cm9rZSkge1xyXG5cdFx0XHR0aGlzLl9wYXRoLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLWxpbmVqb2luJywgJ3JvdW5kJyk7XHJcblx0XHRcdHRoaXMuX3BhdGguc2V0QXR0cmlidXRlKCdzdHJva2UtbGluZWNhcCcsICdyb3VuZCcpO1xyXG5cdFx0fVxyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5maWxsKSB7XHJcblx0XHRcdHRoaXMuX3BhdGguc2V0QXR0cmlidXRlKCdmaWxsLXJ1bGUnLCAnZXZlbm9kZCcpO1xyXG5cdFx0fVxyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5wb2ludGVyRXZlbnRzKSB7XHJcblx0XHRcdHRoaXMuX3BhdGguc2V0QXR0cmlidXRlKCdwb2ludGVyLWV2ZW50cycsIHRoaXMub3B0aW9ucy5wb2ludGVyRXZlbnRzKTtcclxuXHRcdH1cclxuXHRcdGlmICghdGhpcy5vcHRpb25zLmNsaWNrYWJsZSAmJiAhdGhpcy5vcHRpb25zLnBvaW50ZXJFdmVudHMpIHtcclxuXHRcdFx0dGhpcy5fcGF0aC5zZXRBdHRyaWJ1dGUoJ3BvaW50ZXItZXZlbnRzJywgJ25vbmUnKTtcclxuXHRcdH1cclxuXHRcdHRoaXMuX3VwZGF0ZVN0eWxlKCk7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZVN0eWxlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnN0cm9rZSkge1xyXG5cdFx0XHR0aGlzLl9wYXRoLnNldEF0dHJpYnV0ZSgnc3Ryb2tlJywgdGhpcy5vcHRpb25zLmNvbG9yKTtcclxuXHRcdFx0dGhpcy5fcGF0aC5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS1vcGFjaXR5JywgdGhpcy5vcHRpb25zLm9wYWNpdHkpO1xyXG5cdFx0XHR0aGlzLl9wYXRoLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLXdpZHRoJywgdGhpcy5vcHRpb25zLndlaWdodCk7XHJcblx0XHRcdGlmICh0aGlzLm9wdGlvbnMuZGFzaEFycmF5KSB7XHJcblx0XHRcdFx0dGhpcy5fcGF0aC5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS1kYXNoYXJyYXknLCB0aGlzLm9wdGlvbnMuZGFzaEFycmF5KTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHR0aGlzLl9wYXRoLnJlbW92ZUF0dHJpYnV0ZSgnc3Ryb2tlLWRhc2hhcnJheScpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmICh0aGlzLm9wdGlvbnMubGluZUNhcCkge1xyXG5cdFx0XHRcdHRoaXMuX3BhdGguc2V0QXR0cmlidXRlKCdzdHJva2UtbGluZWNhcCcsIHRoaXMub3B0aW9ucy5saW5lQ2FwKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLmxpbmVKb2luKSB7XHJcblx0XHRcdFx0dGhpcy5fcGF0aC5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS1saW5lam9pbicsIHRoaXMub3B0aW9ucy5saW5lSm9pbik7XHJcblx0XHRcdH1cclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMuX3BhdGguc2V0QXR0cmlidXRlKCdzdHJva2UnLCAnbm9uZScpO1xyXG5cdFx0fVxyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5maWxsKSB7XHJcblx0XHRcdHRoaXMuX3BhdGguc2V0QXR0cmlidXRlKCdmaWxsJywgdGhpcy5vcHRpb25zLmZpbGxDb2xvciB8fCB0aGlzLm9wdGlvbnMuY29sb3IpO1xyXG5cdFx0XHR0aGlzLl9wYXRoLnNldEF0dHJpYnV0ZSgnZmlsbC1vcGFjaXR5JywgdGhpcy5vcHRpb25zLmZpbGxPcGFjaXR5KTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMuX3BhdGguc2V0QXR0cmlidXRlKCdmaWxsJywgJ25vbmUnKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfdXBkYXRlUGF0aDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHN0ciA9IHRoaXMuZ2V0UGF0aFN0cmluZygpO1xyXG5cdFx0aWYgKCFzdHIpIHtcclxuXHRcdFx0Ly8gZml4IHdlYmtpdCBlbXB0eSBzdHJpbmcgcGFyc2luZyBidWdcclxuXHRcdFx0c3RyID0gJ00wIDAnO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fcGF0aC5zZXRBdHRyaWJ1dGUoJ2QnLCBzdHIpO1xyXG5cdH0sXHJcblxyXG5cdC8vIFRPRE8gcmVtb3ZlIGR1cGxpY2F0aW9uIHdpdGggTC5NYXBcclxuXHRfaW5pdEV2ZW50czogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5jbGlja2FibGUpIHtcclxuXHRcdFx0aWYgKEwuQnJvd3Nlci5zdmcgfHwgIUwuQnJvd3Nlci52bWwpIHtcclxuXHRcdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5fcGF0aCwgJ2xlYWZsZXQtY2xpY2thYmxlJyk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdEwuRG9tRXZlbnQub24odGhpcy5fY29udGFpbmVyLCAnY2xpY2snLCB0aGlzLl9vbk1vdXNlQ2xpY2ssIHRoaXMpO1xyXG5cclxuXHRcdFx0dmFyIGV2ZW50cyA9IFsnZGJsY2xpY2snLCAnbW91c2Vkb3duJywgJ21vdXNlb3ZlcicsXHJcblx0XHRcdCAgICAgICAgICAgICAgJ21vdXNlb3V0JywgJ21vdXNlbW92ZScsICdjb250ZXh0bWVudSddO1xyXG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGV2ZW50cy5sZW5ndGg7IGkrKykge1xyXG5cdFx0XHRcdEwuRG9tRXZlbnQub24odGhpcy5fY29udGFpbmVyLCBldmVudHNbaV0sIHRoaXMuX2ZpcmVNb3VzZUV2ZW50LCB0aGlzKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9vbk1vdXNlQ2xpY2s6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHRpZiAodGhpcy5fbWFwLmRyYWdnaW5nICYmIHRoaXMuX21hcC5kcmFnZ2luZy5tb3ZlZCgpKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdHRoaXMuX2ZpcmVNb3VzZUV2ZW50KGUpO1xyXG5cdH0sXHJcblxyXG5cdF9maXJlTW91c2VFdmVudDogZnVuY3Rpb24gKGUpIHtcclxuXHRcdGlmICghdGhpcy5oYXNFdmVudExpc3RlbmVycyhlLnR5cGUpKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdHZhciBtYXAgPSB0aGlzLl9tYXAsXHJcblx0XHQgICAgY29udGFpbmVyUG9pbnQgPSBtYXAubW91c2VFdmVudFRvQ29udGFpbmVyUG9pbnQoZSksXHJcblx0XHQgICAgbGF5ZXJQb2ludCA9IG1hcC5jb250YWluZXJQb2ludFRvTGF5ZXJQb2ludChjb250YWluZXJQb2ludCksXHJcblx0XHQgICAgbGF0bG5nID0gbWFwLmxheWVyUG9pbnRUb0xhdExuZyhsYXllclBvaW50KTtcclxuXHJcblx0XHR0aGlzLmZpcmUoZS50eXBlLCB7XHJcblx0XHRcdGxhdGxuZzogbGF0bG5nLFxyXG5cdFx0XHRsYXllclBvaW50OiBsYXllclBvaW50LFxyXG5cdFx0XHRjb250YWluZXJQb2ludDogY29udGFpbmVyUG9pbnQsXHJcblx0XHRcdG9yaWdpbmFsRXZlbnQ6IGVcclxuXHRcdH0pO1xyXG5cclxuXHRcdGlmIChlLnR5cGUgPT09ICdjb250ZXh0bWVudScpIHtcclxuXHRcdFx0TC5Eb21FdmVudC5wcmV2ZW50RGVmYXVsdChlKTtcclxuXHRcdH1cclxuXHRcdGlmIChlLnR5cGUgIT09ICdtb3VzZW1vdmUnKSB7XHJcblx0XHRcdEwuRG9tRXZlbnQuc3RvcFByb3BhZ2F0aW9uKGUpO1xyXG5cdFx0fVxyXG5cdH1cclxufSk7XHJcblxyXG5MLk1hcC5pbmNsdWRlKHtcclxuXHRfaW5pdFBhdGhSb290OiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAoIXRoaXMuX3BhdGhSb290KSB7XHJcblx0XHRcdHRoaXMuX3BhdGhSb290ID0gTC5QYXRoLnByb3RvdHlwZS5fY3JlYXRlRWxlbWVudCgnc3ZnJyk7XHJcblx0XHRcdHRoaXMuX3BhbmVzLm92ZXJsYXlQYW5lLmFwcGVuZENoaWxkKHRoaXMuX3BhdGhSb290KTtcclxuXHJcblx0XHRcdGlmICh0aGlzLm9wdGlvbnMuem9vbUFuaW1hdGlvbiAmJiBMLkJyb3dzZXIuYW55M2QpIHtcclxuXHRcdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5fcGF0aFJvb3QsICdsZWFmbGV0LXpvb20tYW5pbWF0ZWQnKTtcclxuXHJcblx0XHRcdFx0dGhpcy5vbih7XHJcblx0XHRcdFx0XHQnem9vbWFuaW0nOiB0aGlzLl9hbmltYXRlUGF0aFpvb20sXHJcblx0XHRcdFx0XHQnem9vbWVuZCc6IHRoaXMuX2VuZFBhdGhab29tXHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKHRoaXMuX3BhdGhSb290LCAnbGVhZmxldC16b29tLWhpZGUnKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0dGhpcy5vbignbW92ZWVuZCcsIHRoaXMuX3VwZGF0ZVN2Z1ZpZXdwb3J0KTtcclxuXHRcdFx0dGhpcy5fdXBkYXRlU3ZnVmlld3BvcnQoKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfYW5pbWF0ZVBhdGhab29tOiBmdW5jdGlvbiAoZSkge1xyXG5cdFx0dmFyIHNjYWxlID0gdGhpcy5nZXRab29tU2NhbGUoZS56b29tKSxcclxuXHRcdCAgICBvZmZzZXQgPSB0aGlzLl9nZXRDZW50ZXJPZmZzZXQoZS5jZW50ZXIpLl9tdWx0aXBseUJ5KC1zY2FsZSkuX2FkZCh0aGlzLl9wYXRoVmlld3BvcnQubWluKTtcclxuXHJcblx0XHR0aGlzLl9wYXRoUm9vdC5zdHlsZVtMLkRvbVV0aWwuVFJBTlNGT1JNXSA9XHJcblx0XHQgICAgICAgIEwuRG9tVXRpbC5nZXRUcmFuc2xhdGVTdHJpbmcob2Zmc2V0KSArICcgc2NhbGUoJyArIHNjYWxlICsgJykgJztcclxuXHJcblx0XHR0aGlzLl9wYXRoWm9vbWluZyA9IHRydWU7XHJcblx0fSxcclxuXHJcblx0X2VuZFBhdGhab29tOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLl9wYXRoWm9vbWluZyA9IGZhbHNlO1xyXG5cdH0sXHJcblxyXG5cdF91cGRhdGVTdmdWaWV3cG9ydDogZnVuY3Rpb24gKCkge1xyXG5cclxuXHRcdGlmICh0aGlzLl9wYXRoWm9vbWluZykge1xyXG5cdFx0XHQvLyBEbyBub3QgdXBkYXRlIFNWR3Mgd2hpbGUgYSB6b29tIGFuaW1hdGlvbiBpcyBnb2luZyBvbiBvdGhlcndpc2UgdGhlIGFuaW1hdGlvbiB3aWxsIGJyZWFrLlxyXG5cdFx0XHQvLyBXaGVuIHRoZSB6b29tIGFuaW1hdGlvbiBlbmRzIHdlIHdpbGwgYmUgdXBkYXRlZCBhZ2FpbiBhbnl3YXlcclxuXHRcdFx0Ly8gVGhpcyBmaXhlcyB0aGUgY2FzZSB3aGVyZSB5b3UgZG8gYSBtb21lbnR1bSBtb3ZlIGFuZCB6b29tIHdoaWxlIHRoZSBtb3ZlIGlzIHN0aWxsIG9uZ29pbmcuXHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl91cGRhdGVQYXRoVmlld3BvcnQoKTtcclxuXHJcblx0XHR2YXIgdnAgPSB0aGlzLl9wYXRoVmlld3BvcnQsXHJcblx0XHQgICAgbWluID0gdnAubWluLFxyXG5cdFx0ICAgIG1heCA9IHZwLm1heCxcclxuXHRcdCAgICB3aWR0aCA9IG1heC54IC0gbWluLngsXHJcblx0XHQgICAgaGVpZ2h0ID0gbWF4LnkgLSBtaW4ueSxcclxuXHRcdCAgICByb290ID0gdGhpcy5fcGF0aFJvb3QsXHJcblx0XHQgICAgcGFuZSA9IHRoaXMuX3BhbmVzLm92ZXJsYXlQYW5lO1xyXG5cclxuXHRcdC8vIEhhY2sgdG8gbWFrZSBmbGlja2VyIG9uIGRyYWcgZW5kIG9uIG1vYmlsZSB3ZWJraXQgbGVzcyBpcnJpdGF0aW5nXHJcblx0XHRpZiAoTC5Ccm93c2VyLm1vYmlsZVdlYmtpdCkge1xyXG5cdFx0XHRwYW5lLnJlbW92ZUNoaWxkKHJvb3QpO1xyXG5cdFx0fVxyXG5cclxuXHRcdEwuRG9tVXRpbC5zZXRQb3NpdGlvbihyb290LCBtaW4pO1xyXG5cdFx0cm9vdC5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgd2lkdGgpO1xyXG5cdFx0cm9vdC5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsIGhlaWdodCk7XHJcblx0XHRyb290LnNldEF0dHJpYnV0ZSgndmlld0JveCcsIFttaW4ueCwgbWluLnksIHdpZHRoLCBoZWlnaHRdLmpvaW4oJyAnKSk7XHJcblxyXG5cdFx0aWYgKEwuQnJvd3Nlci5tb2JpbGVXZWJraXQpIHtcclxuXHRcdFx0cGFuZS5hcHBlbmRDaGlsZChyb290KTtcclxuXHRcdH1cclxuXHR9XHJcbn0pO1xyXG5cblxuLypcclxuICogUG9wdXAgZXh0ZW5zaW9uIHRvIEwuUGF0aCAocG9seWxpbmVzLCBwb2x5Z29ucywgY2lyY2xlcyksIGFkZGluZyBwb3B1cC1yZWxhdGVkIG1ldGhvZHMuXHJcbiAqL1xyXG5cclxuTC5QYXRoLmluY2x1ZGUoe1xyXG5cclxuXHRiaW5kUG9wdXA6IGZ1bmN0aW9uIChjb250ZW50LCBvcHRpb25zKSB7XHJcblxyXG5cdFx0aWYgKGNvbnRlbnQgaW5zdGFuY2VvZiBMLlBvcHVwKSB7XHJcblx0XHRcdHRoaXMuX3BvcHVwID0gY29udGVudDtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGlmICghdGhpcy5fcG9wdXAgfHwgb3B0aW9ucykge1xyXG5cdFx0XHRcdHRoaXMuX3BvcHVwID0gbmV3IEwuUG9wdXAob3B0aW9ucywgdGhpcyk7XHJcblx0XHRcdH1cclxuXHRcdFx0dGhpcy5fcG9wdXAuc2V0Q29udGVudChjb250ZW50KTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoIXRoaXMuX3BvcHVwSGFuZGxlcnNBZGRlZCkge1xyXG5cdFx0XHR0aGlzXHJcblx0XHRcdCAgICAub24oJ2NsaWNrJywgdGhpcy5fb3BlblBvcHVwLCB0aGlzKVxyXG5cdFx0XHQgICAgLm9uKCdyZW1vdmUnLCB0aGlzLmNsb3NlUG9wdXAsIHRoaXMpO1xyXG5cclxuXHRcdFx0dGhpcy5fcG9wdXBIYW5kbGVyc0FkZGVkID0gdHJ1ZTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHR1bmJpbmRQb3B1cDogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKHRoaXMuX3BvcHVwKSB7XHJcblx0XHRcdHRoaXMuX3BvcHVwID0gbnVsbDtcclxuXHRcdFx0dGhpc1xyXG5cdFx0XHQgICAgLm9mZignY2xpY2snLCB0aGlzLl9vcGVuUG9wdXApXHJcblx0XHRcdCAgICAub2ZmKCdyZW1vdmUnLCB0aGlzLmNsb3NlUG9wdXApO1xyXG5cclxuXHRcdFx0dGhpcy5fcG9wdXBIYW5kbGVyc0FkZGVkID0gZmFsc2U7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRvcGVuUG9wdXA6IGZ1bmN0aW9uIChsYXRsbmcpIHtcclxuXHJcblx0XHRpZiAodGhpcy5fcG9wdXApIHtcclxuXHRcdFx0Ly8gb3BlbiB0aGUgcG9wdXAgZnJvbSBvbmUgb2YgdGhlIHBhdGgncyBwb2ludHMgaWYgbm90IHNwZWNpZmllZFxyXG5cdFx0XHRsYXRsbmcgPSBsYXRsbmcgfHwgdGhpcy5fbGF0bG5nIHx8XHJcblx0XHRcdCAgICAgICAgIHRoaXMuX2xhdGxuZ3NbTWF0aC5mbG9vcih0aGlzLl9sYXRsbmdzLmxlbmd0aCAvIDIpXTtcclxuXHJcblx0XHRcdHRoaXMuX29wZW5Qb3B1cCh7bGF0bG5nOiBsYXRsbmd9KTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRjbG9zZVBvcHVwOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fcG9wdXApIHtcclxuXHRcdFx0dGhpcy5fcG9wdXAuX2Nsb3NlKCk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRfb3BlblBvcHVwOiBmdW5jdGlvbiAoZSkge1xyXG5cdFx0dGhpcy5fcG9wdXAuc2V0TGF0TG5nKGUubGF0bG5nKTtcclxuXHRcdHRoaXMuX21hcC5vcGVuUG9wdXAodGhpcy5fcG9wdXApO1xyXG5cdH1cclxufSk7XHJcblxuXG4vKlxyXG4gKiBWZWN0b3IgcmVuZGVyaW5nIGZvciBJRTYtOCB0aHJvdWdoIFZNTC5cclxuICogVGhhbmtzIHRvIERtaXRyeSBCYXJhbm92c2t5IGFuZCBoaXMgUmFwaGFlbCBsaWJyYXJ5IGZvciBpbnNwaXJhdGlvbiFcclxuICovXHJcblxyXG5MLkJyb3dzZXIudm1sID0gIUwuQnJvd3Nlci5zdmcgJiYgKGZ1bmN0aW9uICgpIHtcclxuXHR0cnkge1xyXG5cdFx0dmFyIGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG5cdFx0ZGl2LmlubmVySFRNTCA9ICc8djpzaGFwZSBhZGo9XCIxXCIvPic7XHJcblxyXG5cdFx0dmFyIHNoYXBlID0gZGl2LmZpcnN0Q2hpbGQ7XHJcblx0XHRzaGFwZS5zdHlsZS5iZWhhdmlvciA9ICd1cmwoI2RlZmF1bHQjVk1MKSc7XHJcblxyXG5cdFx0cmV0dXJuIHNoYXBlICYmICh0eXBlb2Ygc2hhcGUuYWRqID09PSAnb2JqZWN0Jyk7XHJcblxyXG5cdH0gY2F0Y2ggKGUpIHtcclxuXHRcdHJldHVybiBmYWxzZTtcclxuXHR9XHJcbn0oKSk7XHJcblxyXG5MLlBhdGggPSBMLkJyb3dzZXIuc3ZnIHx8ICFMLkJyb3dzZXIudm1sID8gTC5QYXRoIDogTC5QYXRoLmV4dGVuZCh7XHJcblx0c3RhdGljczoge1xyXG5cdFx0Vk1MOiB0cnVlLFxyXG5cdFx0Q0xJUF9QQURESU5HOiAwLjAyXHJcblx0fSxcclxuXHJcblx0X2NyZWF0ZUVsZW1lbnQ6IChmdW5jdGlvbiAoKSB7XHJcblx0XHR0cnkge1xyXG5cdFx0XHRkb2N1bWVudC5uYW1lc3BhY2VzLmFkZCgnbHZtbCcsICd1cm46c2NoZW1hcy1taWNyb3NvZnQtY29tOnZtbCcpO1xyXG5cdFx0XHRyZXR1cm4gZnVuY3Rpb24gKG5hbWUpIHtcclxuXHRcdFx0XHRyZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnPGx2bWw6JyArIG5hbWUgKyAnIGNsYXNzPVwibHZtbFwiPicpO1xyXG5cdFx0XHR9O1xyXG5cdFx0fSBjYXRjaCAoZSkge1xyXG5cdFx0XHRyZXR1cm4gZnVuY3Rpb24gKG5hbWUpIHtcclxuXHRcdFx0XHRyZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcclxuXHRcdFx0XHQgICAgICAgICc8JyArIG5hbWUgKyAnIHhtbG5zPVwidXJuOnNjaGVtYXMtbWljcm9zb2Z0LmNvbTp2bWxcIiBjbGFzcz1cImx2bWxcIj4nKTtcclxuXHRcdFx0fTtcclxuXHRcdH1cclxuXHR9KCkpLFxyXG5cclxuXHRfaW5pdFBhdGg6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBjb250YWluZXIgPSB0aGlzLl9jb250YWluZXIgPSB0aGlzLl9jcmVhdGVFbGVtZW50KCdzaGFwZScpO1xyXG5cclxuXHRcdEwuRG9tVXRpbC5hZGRDbGFzcyhjb250YWluZXIsICdsZWFmbGV0LXZtbC1zaGFwZScgK1xyXG5cdFx0XHQodGhpcy5vcHRpb25zLmNsYXNzTmFtZSA/ICcgJyArIHRoaXMub3B0aW9ucy5jbGFzc05hbWUgOiAnJykpO1xyXG5cclxuXHRcdGlmICh0aGlzLm9wdGlvbnMuY2xpY2thYmxlKSB7XHJcblx0XHRcdEwuRG9tVXRpbC5hZGRDbGFzcyhjb250YWluZXIsICdsZWFmbGV0LWNsaWNrYWJsZScpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGNvbnRhaW5lci5jb29yZHNpemUgPSAnMSAxJztcclxuXHJcblx0XHR0aGlzLl9wYXRoID0gdGhpcy5fY3JlYXRlRWxlbWVudCgncGF0aCcpO1xyXG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3BhdGgpO1xyXG5cclxuXHRcdHRoaXMuX21hcC5fcGF0aFJvb3QuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcclxuXHR9LFxyXG5cclxuXHRfaW5pdFN0eWxlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLl91cGRhdGVTdHlsZSgpO1xyXG5cdH0sXHJcblxyXG5cdF91cGRhdGVTdHlsZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHN0cm9rZSA9IHRoaXMuX3N0cm9rZSxcclxuXHRcdCAgICBmaWxsID0gdGhpcy5fZmlsbCxcclxuXHRcdCAgICBvcHRpb25zID0gdGhpcy5vcHRpb25zLFxyXG5cdFx0ICAgIGNvbnRhaW5lciA9IHRoaXMuX2NvbnRhaW5lcjtcclxuXHJcblx0XHRjb250YWluZXIuc3Ryb2tlZCA9IG9wdGlvbnMuc3Ryb2tlO1xyXG5cdFx0Y29udGFpbmVyLmZpbGxlZCA9IG9wdGlvbnMuZmlsbDtcclxuXHJcblx0XHRpZiAob3B0aW9ucy5zdHJva2UpIHtcclxuXHRcdFx0aWYgKCFzdHJva2UpIHtcclxuXHRcdFx0XHRzdHJva2UgPSB0aGlzLl9zdHJva2UgPSB0aGlzLl9jcmVhdGVFbGVtZW50KCdzdHJva2UnKTtcclxuXHRcdFx0XHRzdHJva2UuZW5kY2FwID0gJ3JvdW5kJztcclxuXHRcdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoc3Ryb2tlKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRzdHJva2Uud2VpZ2h0ID0gb3B0aW9ucy53ZWlnaHQgKyAncHgnO1xyXG5cdFx0XHRzdHJva2UuY29sb3IgPSBvcHRpb25zLmNvbG9yO1xyXG5cdFx0XHRzdHJva2Uub3BhY2l0eSA9IG9wdGlvbnMub3BhY2l0eTtcclxuXHJcblx0XHRcdGlmIChvcHRpb25zLmRhc2hBcnJheSkge1xyXG5cdFx0XHRcdHN0cm9rZS5kYXNoU3R5bGUgPSBMLlV0aWwuaXNBcnJheShvcHRpb25zLmRhc2hBcnJheSkgP1xyXG5cdFx0XHRcdCAgICBvcHRpb25zLmRhc2hBcnJheS5qb2luKCcgJykgOlxyXG5cdFx0XHRcdCAgICBvcHRpb25zLmRhc2hBcnJheS5yZXBsYWNlKC8oICosICopL2csICcgJyk7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0c3Ryb2tlLmRhc2hTdHlsZSA9ICcnO1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmIChvcHRpb25zLmxpbmVDYXApIHtcclxuXHRcdFx0XHRzdHJva2UuZW5kY2FwID0gb3B0aW9ucy5saW5lQ2FwLnJlcGxhY2UoJ2J1dHQnLCAnZmxhdCcpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmIChvcHRpb25zLmxpbmVKb2luKSB7XHJcblx0XHRcdFx0c3Ryb2tlLmpvaW5zdHlsZSA9IG9wdGlvbnMubGluZUpvaW47XHJcblx0XHRcdH1cclxuXHJcblx0XHR9IGVsc2UgaWYgKHN0cm9rZSkge1xyXG5cdFx0XHRjb250YWluZXIucmVtb3ZlQ2hpbGQoc3Ryb2tlKTtcclxuXHRcdFx0dGhpcy5fc3Ryb2tlID0gbnVsbDtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAob3B0aW9ucy5maWxsKSB7XHJcblx0XHRcdGlmICghZmlsbCkge1xyXG5cdFx0XHRcdGZpbGwgPSB0aGlzLl9maWxsID0gdGhpcy5fY3JlYXRlRWxlbWVudCgnZmlsbCcpO1xyXG5cdFx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChmaWxsKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRmaWxsLmNvbG9yID0gb3B0aW9ucy5maWxsQ29sb3IgfHwgb3B0aW9ucy5jb2xvcjtcclxuXHRcdFx0ZmlsbC5vcGFjaXR5ID0gb3B0aW9ucy5maWxsT3BhY2l0eTtcclxuXHJcblx0XHR9IGVsc2UgaWYgKGZpbGwpIHtcclxuXHRcdFx0Y29udGFpbmVyLnJlbW92ZUNoaWxkKGZpbGwpO1xyXG5cdFx0XHR0aGlzLl9maWxsID0gbnVsbDtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfdXBkYXRlUGF0aDogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHN0eWxlID0gdGhpcy5fY29udGFpbmVyLnN0eWxlO1xyXG5cclxuXHRcdHN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XHJcblx0XHR0aGlzLl9wYXRoLnYgPSB0aGlzLmdldFBhdGhTdHJpbmcoKSArICcgJzsgLy8gdGhlIHNwYWNlIGZpeGVzIElFIGVtcHR5IHBhdGggc3RyaW5nIGJ1Z1xyXG5cdFx0c3R5bGUuZGlzcGxheSA9ICcnO1xyXG5cdH1cclxufSk7XHJcblxyXG5MLk1hcC5pbmNsdWRlKEwuQnJvd3Nlci5zdmcgfHwgIUwuQnJvd3Nlci52bWwgPyB7fSA6IHtcclxuXHRfaW5pdFBhdGhSb290OiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fcGF0aFJvb3QpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dmFyIHJvb3QgPSB0aGlzLl9wYXRoUm9vdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG5cdFx0cm9vdC5jbGFzc05hbWUgPSAnbGVhZmxldC12bWwtY29udGFpbmVyJztcclxuXHRcdHRoaXMuX3BhbmVzLm92ZXJsYXlQYW5lLmFwcGVuZENoaWxkKHJvb3QpO1xyXG5cclxuXHRcdHRoaXMub24oJ21vdmVlbmQnLCB0aGlzLl91cGRhdGVQYXRoVmlld3BvcnQpO1xyXG5cdFx0dGhpcy5fdXBkYXRlUGF0aFZpZXdwb3J0KCk7XHJcblx0fVxyXG59KTtcclxuXG5cbi8qXHJcbiAqIFZlY3RvciByZW5kZXJpbmcgZm9yIGFsbCBicm93c2VycyB0aGF0IHN1cHBvcnQgY2FudmFzLlxyXG4gKi9cclxuXHJcbkwuQnJvd3Nlci5jYW52YXMgPSAoZnVuY3Rpb24gKCkge1xyXG5cdHJldHVybiAhIWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpLmdldENvbnRleHQ7XHJcbn0oKSk7XHJcblxyXG5MLlBhdGggPSAoTC5QYXRoLlNWRyAmJiAhd2luZG93LkxfUFJFRkVSX0NBTlZBUykgfHwgIUwuQnJvd3Nlci5jYW52YXMgPyBMLlBhdGggOiBMLlBhdGguZXh0ZW5kKHtcclxuXHRzdGF0aWNzOiB7XHJcblx0XHQvL0NMSVBfUEFERElORzogMC4wMiwgLy8gbm90IHN1cmUgaWYgdGhlcmUncyBhIG5lZWQgdG8gc2V0IGl0IHRvIGEgc21hbGwgdmFsdWVcclxuXHRcdENBTlZBUzogdHJ1ZSxcclxuXHRcdFNWRzogZmFsc2VcclxuXHR9LFxyXG5cclxuXHRyZWRyYXc6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9tYXApIHtcclxuXHRcdFx0dGhpcy5wcm9qZWN0TGF0bG5ncygpO1xyXG5cdFx0XHR0aGlzLl9yZXF1ZXN0VXBkYXRlKCk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzZXRTdHlsZTogZnVuY3Rpb24gKHN0eWxlKSB7XHJcblx0XHRMLnNldE9wdGlvbnModGhpcywgc3R5bGUpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9tYXApIHtcclxuXHRcdFx0dGhpcy5fdXBkYXRlU3R5bGUoKTtcclxuXHRcdFx0dGhpcy5fcmVxdWVzdFVwZGF0ZSgpO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0b25SZW1vdmU6IGZ1bmN0aW9uIChtYXApIHtcclxuXHRcdG1hcFxyXG5cdFx0ICAgIC5vZmYoJ3ZpZXdyZXNldCcsIHRoaXMucHJvamVjdExhdGxuZ3MsIHRoaXMpXHJcblx0XHQgICAgLm9mZignbW92ZWVuZCcsIHRoaXMuX3VwZGF0ZVBhdGgsIHRoaXMpO1xyXG5cclxuXHRcdGlmICh0aGlzLm9wdGlvbnMuY2xpY2thYmxlKSB7XHJcblx0XHRcdHRoaXMuX21hcC5vZmYoJ2NsaWNrJywgdGhpcy5fb25DbGljaywgdGhpcyk7XHJcblx0XHRcdHRoaXMuX21hcC5vZmYoJ21vdXNlbW92ZScsIHRoaXMuX29uTW91c2VNb3ZlLCB0aGlzKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9yZXF1ZXN0VXBkYXRlKCk7XHJcblx0XHRcclxuXHRcdHRoaXMuZmlyZSgncmVtb3ZlJyk7XHJcblx0XHR0aGlzLl9tYXAgPSBudWxsO1xyXG5cdH0sXHJcblxyXG5cdF9yZXF1ZXN0VXBkYXRlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fbWFwICYmICFMLlBhdGguX3VwZGF0ZVJlcXVlc3QpIHtcclxuXHRcdFx0TC5QYXRoLl91cGRhdGVSZXF1ZXN0ID0gTC5VdGlsLnJlcXVlc3RBbmltRnJhbWUodGhpcy5fZmlyZU1hcE1vdmVFbmQsIHRoaXMuX21hcCk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2ZpcmVNYXBNb3ZlRW5kOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRMLlBhdGguX3VwZGF0ZVJlcXVlc3QgPSBudWxsO1xyXG5cdFx0dGhpcy5maXJlKCdtb3ZlZW5kJyk7XHJcblx0fSxcclxuXHJcblx0X2luaXRFbGVtZW50czogZnVuY3Rpb24gKCkge1xyXG5cdFx0dGhpcy5fbWFwLl9pbml0UGF0aFJvb3QoKTtcclxuXHRcdHRoaXMuX2N0eCA9IHRoaXMuX21hcC5fY2FudmFzQ3R4O1xyXG5cdH0sXHJcblxyXG5cdF91cGRhdGVTdHlsZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnM7XHJcblxyXG5cdFx0aWYgKG9wdGlvbnMuc3Ryb2tlKSB7XHJcblx0XHRcdHRoaXMuX2N0eC5saW5lV2lkdGggPSBvcHRpb25zLndlaWdodDtcclxuXHRcdFx0dGhpcy5fY3R4LnN0cm9rZVN0eWxlID0gb3B0aW9ucy5jb2xvcjtcclxuXHRcdH1cclxuXHRcdGlmIChvcHRpb25zLmZpbGwpIHtcclxuXHRcdFx0dGhpcy5fY3R4LmZpbGxTdHlsZSA9IG9wdGlvbnMuZmlsbENvbG9yIHx8IG9wdGlvbnMuY29sb3I7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2RyYXdQYXRoOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR2YXIgaSwgaiwgbGVuLCBsZW4yLCBwb2ludCwgZHJhd01ldGhvZDtcclxuXHJcblx0XHR0aGlzLl9jdHguYmVnaW5QYXRoKCk7XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gdGhpcy5fcGFydHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0Zm9yIChqID0gMCwgbGVuMiA9IHRoaXMuX3BhcnRzW2ldLmxlbmd0aDsgaiA8IGxlbjI7IGorKykge1xyXG5cdFx0XHRcdHBvaW50ID0gdGhpcy5fcGFydHNbaV1bal07XHJcblx0XHRcdFx0ZHJhd01ldGhvZCA9IChqID09PSAwID8gJ21vdmUnIDogJ2xpbmUnKSArICdUbyc7XHJcblxyXG5cdFx0XHRcdHRoaXMuX2N0eFtkcmF3TWV0aG9kXShwb2ludC54LCBwb2ludC55KTtcclxuXHRcdFx0fVxyXG5cdFx0XHQvLyBUT0RPIHJlZmFjdG9yIHVnbHkgaGFja1xyXG5cdFx0XHRpZiAodGhpcyBpbnN0YW5jZW9mIEwuUG9seWdvbikge1xyXG5cdFx0XHRcdHRoaXMuX2N0eC5jbG9zZVBhdGgoKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9jaGVja0lmRW1wdHk6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiAhdGhpcy5fcGFydHMubGVuZ3RoO1xyXG5cdH0sXHJcblxyXG5cdF91cGRhdGVQYXRoOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fY2hlY2tJZkVtcHR5KCkpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dmFyIGN0eCA9IHRoaXMuX2N0eCxcclxuXHRcdCAgICBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xyXG5cclxuXHRcdHRoaXMuX2RyYXdQYXRoKCk7XHJcblx0XHRjdHguc2F2ZSgpO1xyXG5cdFx0dGhpcy5fdXBkYXRlU3R5bGUoKTtcclxuXHJcblx0XHRpZiAob3B0aW9ucy5maWxsKSB7XHJcblx0XHRcdGN0eC5nbG9iYWxBbHBoYSA9IG9wdGlvbnMuZmlsbE9wYWNpdHk7XHJcblx0XHRcdGN0eC5maWxsKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKG9wdGlvbnMuc3Ryb2tlKSB7XHJcblx0XHRcdGN0eC5nbG9iYWxBbHBoYSA9IG9wdGlvbnMub3BhY2l0eTtcclxuXHRcdFx0Y3R4LnN0cm9rZSgpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGN0eC5yZXN0b3JlKCk7XHJcblxyXG5cdFx0Ly8gVE9ETyBvcHRpbWl6YXRpb246IDEgZmlsbC9zdHJva2UgZm9yIGFsbCBmZWF0dXJlcyB3aXRoIGVxdWFsIHN0eWxlIGluc3RlYWQgb2YgMSBmb3IgZWFjaCBmZWF0dXJlXHJcblx0fSxcclxuXHJcblx0X2luaXRFdmVudHM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLm9wdGlvbnMuY2xpY2thYmxlKSB7XHJcblx0XHRcdC8vIFRPRE8gZGJsY2xpY2tcclxuXHRcdFx0dGhpcy5fbWFwLm9uKCdtb3VzZW1vdmUnLCB0aGlzLl9vbk1vdXNlTW92ZSwgdGhpcyk7XHJcblx0XHRcdHRoaXMuX21hcC5vbignY2xpY2snLCB0aGlzLl9vbkNsaWNrLCB0aGlzKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfb25DbGljazogZnVuY3Rpb24gKGUpIHtcclxuXHRcdGlmICh0aGlzLl9jb250YWluc1BvaW50KGUubGF5ZXJQb2ludCkpIHtcclxuXHRcdFx0dGhpcy5maXJlKCdjbGljaycsIGUpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9vbk1vdXNlTW92ZTogZnVuY3Rpb24gKGUpIHtcclxuXHRcdGlmICghdGhpcy5fbWFwIHx8IHRoaXMuX21hcC5fYW5pbWF0aW5nWm9vbSkgeyByZXR1cm47IH1cclxuXHJcblx0XHQvLyBUT0RPIGRvbid0IGRvIG9uIGVhY2ggbW92ZVxyXG5cdFx0aWYgKHRoaXMuX2NvbnRhaW5zUG9pbnQoZS5sYXllclBvaW50KSkge1xyXG5cdFx0XHR0aGlzLl9jdHguY2FudmFzLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcclxuXHRcdFx0dGhpcy5fbW91c2VJbnNpZGUgPSB0cnVlO1xyXG5cdFx0XHR0aGlzLmZpcmUoJ21vdXNlb3ZlcicsIGUpO1xyXG5cclxuXHRcdH0gZWxzZSBpZiAodGhpcy5fbW91c2VJbnNpZGUpIHtcclxuXHRcdFx0dGhpcy5fY3R4LmNhbnZhcy5zdHlsZS5jdXJzb3IgPSAnJztcclxuXHRcdFx0dGhpcy5fbW91c2VJbnNpZGUgPSBmYWxzZTtcclxuXHRcdFx0dGhpcy5maXJlKCdtb3VzZW91dCcsIGUpO1xyXG5cdFx0fVxyXG5cdH1cclxufSk7XHJcblxyXG5MLk1hcC5pbmNsdWRlKChMLlBhdGguU1ZHICYmICF3aW5kb3cuTF9QUkVGRVJfQ0FOVkFTKSB8fCAhTC5Ccm93c2VyLmNhbnZhcyA/IHt9IDoge1xyXG5cdF9pbml0UGF0aFJvb3Q6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciByb290ID0gdGhpcy5fcGF0aFJvb3QsXHJcblx0XHQgICAgY3R4O1xyXG5cclxuXHRcdGlmICghcm9vdCkge1xyXG5cdFx0XHRyb290ID0gdGhpcy5fcGF0aFJvb3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuXHRcdFx0cm9vdC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcblx0XHRcdGN0eCA9IHRoaXMuX2NhbnZhc0N0eCA9IHJvb3QuZ2V0Q29udGV4dCgnMmQnKTtcclxuXHJcblx0XHRcdGN0eC5saW5lQ2FwID0gJ3JvdW5kJztcclxuXHRcdFx0Y3R4LmxpbmVKb2luID0gJ3JvdW5kJztcclxuXHJcblx0XHRcdHRoaXMuX3BhbmVzLm92ZXJsYXlQYW5lLmFwcGVuZENoaWxkKHJvb3QpO1xyXG5cclxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy56b29tQW5pbWF0aW9uKSB7XHJcblx0XHRcdFx0dGhpcy5fcGF0aFJvb3QuY2xhc3NOYW1lID0gJ2xlYWZsZXQtem9vbS1hbmltYXRlZCc7XHJcblx0XHRcdFx0dGhpcy5vbignem9vbWFuaW0nLCB0aGlzLl9hbmltYXRlUGF0aFpvb20pO1xyXG5cdFx0XHRcdHRoaXMub24oJ3pvb21lbmQnLCB0aGlzLl9lbmRQYXRoWm9vbSk7XHJcblx0XHRcdH1cclxuXHRcdFx0dGhpcy5vbignbW92ZWVuZCcsIHRoaXMuX3VwZGF0ZUNhbnZhc1ZpZXdwb3J0KTtcclxuXHRcdFx0dGhpcy5fdXBkYXRlQ2FudmFzVmlld3BvcnQoKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfdXBkYXRlQ2FudmFzVmlld3BvcnQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdC8vIGRvbid0IHJlZHJhdyB3aGlsZSB6b29taW5nLiBTZWUgX3VwZGF0ZVN2Z1ZpZXdwb3J0IGZvciBtb3JlIGRldGFpbHNcclxuXHRcdGlmICh0aGlzLl9wYXRoWm9vbWluZykgeyByZXR1cm47IH1cclxuXHRcdHRoaXMuX3VwZGF0ZVBhdGhWaWV3cG9ydCgpO1xyXG5cclxuXHRcdHZhciB2cCA9IHRoaXMuX3BhdGhWaWV3cG9ydCxcclxuXHRcdCAgICBtaW4gPSB2cC5taW4sXHJcblx0XHQgICAgc2l6ZSA9IHZwLm1heC5zdWJ0cmFjdChtaW4pLFxyXG5cdFx0ICAgIHJvb3QgPSB0aGlzLl9wYXRoUm9vdDtcclxuXHJcblx0XHQvL1RPRE8gY2hlY2sgaWYgdGhpcyB3b3JrcyBwcm9wZXJseSBvbiBtb2JpbGUgd2Via2l0XHJcblx0XHRMLkRvbVV0aWwuc2V0UG9zaXRpb24ocm9vdCwgbWluKTtcclxuXHRcdHJvb3Qud2lkdGggPSBzaXplLng7XHJcblx0XHRyb290LmhlaWdodCA9IHNpemUueTtcclxuXHRcdHJvb3QuZ2V0Q29udGV4dCgnMmQnKS50cmFuc2xhdGUoLW1pbi54LCAtbWluLnkpO1xyXG5cdH1cclxufSk7XHJcblxuXG4vKlxyXG4gKiBMLkxpbmVVdGlsIGNvbnRhaW5zIGRpZmZlcmVudCB1dGlsaXR5IGZ1bmN0aW9ucyBmb3IgbGluZSBzZWdtZW50c1xyXG4gKiBhbmQgcG9seWxpbmVzIChjbGlwcGluZywgc2ltcGxpZmljYXRpb24sIGRpc3RhbmNlcywgZXRjLilcclxuICovXHJcblxyXG4vKmpzaGludCBiaXR3aXNlOmZhbHNlICovIC8vIGFsbG93IGJpdHdpc2Ugb3BlcmF0aW9ucyBmb3IgdGhpcyBmaWxlXHJcblxyXG5MLkxpbmVVdGlsID0ge1xyXG5cclxuXHQvLyBTaW1wbGlmeSBwb2x5bGluZSB3aXRoIHZlcnRleCByZWR1Y3Rpb24gYW5kIERvdWdsYXMtUGV1Y2tlciBzaW1wbGlmaWNhdGlvbi5cclxuXHQvLyBJbXByb3ZlcyByZW5kZXJpbmcgcGVyZm9ybWFuY2UgZHJhbWF0aWNhbGx5IGJ5IGxlc3NlbmluZyB0aGUgbnVtYmVyIG9mIHBvaW50cyB0byBkcmF3LlxyXG5cclxuXHRzaW1wbGlmeTogZnVuY3Rpb24gKC8qUG9pbnRbXSovIHBvaW50cywgLypOdW1iZXIqLyB0b2xlcmFuY2UpIHtcclxuXHRcdGlmICghdG9sZXJhbmNlIHx8ICFwb2ludHMubGVuZ3RoKSB7XHJcblx0XHRcdHJldHVybiBwb2ludHMuc2xpY2UoKTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgc3FUb2xlcmFuY2UgPSB0b2xlcmFuY2UgKiB0b2xlcmFuY2U7XHJcblxyXG5cdFx0Ly8gc3RhZ2UgMTogdmVydGV4IHJlZHVjdGlvblxyXG5cdFx0cG9pbnRzID0gdGhpcy5fcmVkdWNlUG9pbnRzKHBvaW50cywgc3FUb2xlcmFuY2UpO1xyXG5cclxuXHRcdC8vIHN0YWdlIDI6IERvdWdsYXMtUGV1Y2tlciBzaW1wbGlmaWNhdGlvblxyXG5cdFx0cG9pbnRzID0gdGhpcy5fc2ltcGxpZnlEUChwb2ludHMsIHNxVG9sZXJhbmNlKTtcclxuXHJcblx0XHRyZXR1cm4gcG9pbnRzO1xyXG5cdH0sXHJcblxyXG5cdC8vIGRpc3RhbmNlIGZyb20gYSBwb2ludCB0byBhIHNlZ21lbnQgYmV0d2VlbiB0d28gcG9pbnRzXHJcblx0cG9pbnRUb1NlZ21lbnREaXN0YW5jZTogIGZ1bmN0aW9uICgvKlBvaW50Ki8gcCwgLypQb2ludCovIHAxLCAvKlBvaW50Ki8gcDIpIHtcclxuXHRcdHJldHVybiBNYXRoLnNxcnQodGhpcy5fc3FDbG9zZXN0UG9pbnRPblNlZ21lbnQocCwgcDEsIHAyLCB0cnVlKSk7XHJcblx0fSxcclxuXHJcblx0Y2xvc2VzdFBvaW50T25TZWdtZW50OiBmdW5jdGlvbiAoLypQb2ludCovIHAsIC8qUG9pbnQqLyBwMSwgLypQb2ludCovIHAyKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fc3FDbG9zZXN0UG9pbnRPblNlZ21lbnQocCwgcDEsIHAyKTtcclxuXHR9LFxyXG5cclxuXHQvLyBEb3VnbGFzLVBldWNrZXIgc2ltcGxpZmljYXRpb24sIHNlZSBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0RvdWdsYXMtUGV1Y2tlcl9hbGdvcml0aG1cclxuXHRfc2ltcGxpZnlEUDogZnVuY3Rpb24gKHBvaW50cywgc3FUb2xlcmFuY2UpIHtcclxuXHJcblx0XHR2YXIgbGVuID0gcG9pbnRzLmxlbmd0aCxcclxuXHRcdCAgICBBcnJheUNvbnN0cnVjdG9yID0gdHlwZW9mIFVpbnQ4QXJyYXkgIT09IHVuZGVmaW5lZCArICcnID8gVWludDhBcnJheSA6IEFycmF5LFxyXG5cdFx0ICAgIG1hcmtlcnMgPSBuZXcgQXJyYXlDb25zdHJ1Y3RvcihsZW4pO1xyXG5cclxuXHRcdG1hcmtlcnNbMF0gPSBtYXJrZXJzW2xlbiAtIDFdID0gMTtcclxuXHJcblx0XHR0aGlzLl9zaW1wbGlmeURQU3RlcChwb2ludHMsIG1hcmtlcnMsIHNxVG9sZXJhbmNlLCAwLCBsZW4gLSAxKTtcclxuXHJcblx0XHR2YXIgaSxcclxuXHRcdCAgICBuZXdQb2ludHMgPSBbXTtcclxuXHJcblx0XHRmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0aWYgKG1hcmtlcnNbaV0pIHtcclxuXHRcdFx0XHRuZXdQb2ludHMucHVzaChwb2ludHNbaV0pO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIG5ld1BvaW50cztcclxuXHR9LFxyXG5cclxuXHRfc2ltcGxpZnlEUFN0ZXA6IGZ1bmN0aW9uIChwb2ludHMsIG1hcmtlcnMsIHNxVG9sZXJhbmNlLCBmaXJzdCwgbGFzdCkge1xyXG5cclxuXHRcdHZhciBtYXhTcURpc3QgPSAwLFxyXG5cdFx0ICAgIGluZGV4LCBpLCBzcURpc3Q7XHJcblxyXG5cdFx0Zm9yIChpID0gZmlyc3QgKyAxOyBpIDw9IGxhc3QgLSAxOyBpKyspIHtcclxuXHRcdFx0c3FEaXN0ID0gdGhpcy5fc3FDbG9zZXN0UG9pbnRPblNlZ21lbnQocG9pbnRzW2ldLCBwb2ludHNbZmlyc3RdLCBwb2ludHNbbGFzdF0sIHRydWUpO1xyXG5cclxuXHRcdFx0aWYgKHNxRGlzdCA+IG1heFNxRGlzdCkge1xyXG5cdFx0XHRcdGluZGV4ID0gaTtcclxuXHRcdFx0XHRtYXhTcURpc3QgPSBzcURpc3Q7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRpZiAobWF4U3FEaXN0ID4gc3FUb2xlcmFuY2UpIHtcclxuXHRcdFx0bWFya2Vyc1tpbmRleF0gPSAxO1xyXG5cclxuXHRcdFx0dGhpcy5fc2ltcGxpZnlEUFN0ZXAocG9pbnRzLCBtYXJrZXJzLCBzcVRvbGVyYW5jZSwgZmlyc3QsIGluZGV4KTtcclxuXHRcdFx0dGhpcy5fc2ltcGxpZnlEUFN0ZXAocG9pbnRzLCBtYXJrZXJzLCBzcVRvbGVyYW5jZSwgaW5kZXgsIGxhc3QpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdC8vIHJlZHVjZSBwb2ludHMgdGhhdCBhcmUgdG9vIGNsb3NlIHRvIGVhY2ggb3RoZXIgdG8gYSBzaW5nbGUgcG9pbnRcclxuXHRfcmVkdWNlUG9pbnRzOiBmdW5jdGlvbiAocG9pbnRzLCBzcVRvbGVyYW5jZSkge1xyXG5cdFx0dmFyIHJlZHVjZWRQb2ludHMgPSBbcG9pbnRzWzBdXTtcclxuXHJcblx0XHRmb3IgKHZhciBpID0gMSwgcHJldiA9IDAsIGxlbiA9IHBvaW50cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHRpZiAodGhpcy5fc3FEaXN0KHBvaW50c1tpXSwgcG9pbnRzW3ByZXZdKSA+IHNxVG9sZXJhbmNlKSB7XHJcblx0XHRcdFx0cmVkdWNlZFBvaW50cy5wdXNoKHBvaW50c1tpXSk7XHJcblx0XHRcdFx0cHJldiA9IGk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdGlmIChwcmV2IDwgbGVuIC0gMSkge1xyXG5cdFx0XHRyZWR1Y2VkUG9pbnRzLnB1c2gocG9pbnRzW2xlbiAtIDFdKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiByZWR1Y2VkUG9pbnRzO1xyXG5cdH0sXHJcblxyXG5cdC8vIENvaGVuLVN1dGhlcmxhbmQgbGluZSBjbGlwcGluZyBhbGdvcml0aG0uXHJcblx0Ly8gVXNlZCB0byBhdm9pZCByZW5kZXJpbmcgcGFydHMgb2YgYSBwb2x5bGluZSB0aGF0IGFyZSBub3QgY3VycmVudGx5IHZpc2libGUuXHJcblxyXG5cdGNsaXBTZWdtZW50OiBmdW5jdGlvbiAoYSwgYiwgYm91bmRzLCB1c2VMYXN0Q29kZSkge1xyXG5cdFx0dmFyIGNvZGVBID0gdXNlTGFzdENvZGUgPyB0aGlzLl9sYXN0Q29kZSA6IHRoaXMuX2dldEJpdENvZGUoYSwgYm91bmRzKSxcclxuXHRcdCAgICBjb2RlQiA9IHRoaXMuX2dldEJpdENvZGUoYiwgYm91bmRzKSxcclxuXHJcblx0XHQgICAgY29kZU91dCwgcCwgbmV3Q29kZTtcclxuXHJcblx0XHQvLyBzYXZlIDJuZCBjb2RlIHRvIGF2b2lkIGNhbGN1bGF0aW5nIGl0IG9uIHRoZSBuZXh0IHNlZ21lbnRcclxuXHRcdHRoaXMuX2xhc3RDb2RlID0gY29kZUI7XHJcblxyXG5cdFx0d2hpbGUgKHRydWUpIHtcclxuXHRcdFx0Ly8gaWYgYSxiIGlzIGluc2lkZSB0aGUgY2xpcCB3aW5kb3cgKHRyaXZpYWwgYWNjZXB0KVxyXG5cdFx0XHRpZiAoIShjb2RlQSB8IGNvZGVCKSkge1xyXG5cdFx0XHRcdHJldHVybiBbYSwgYl07XHJcblx0XHRcdC8vIGlmIGEsYiBpcyBvdXRzaWRlIHRoZSBjbGlwIHdpbmRvdyAodHJpdmlhbCByZWplY3QpXHJcblx0XHRcdH0gZWxzZSBpZiAoY29kZUEgJiBjb2RlQikge1xyXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcclxuXHRcdFx0Ly8gb3RoZXIgY2FzZXNcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRjb2RlT3V0ID0gY29kZUEgfHwgY29kZUI7XHJcblx0XHRcdFx0cCA9IHRoaXMuX2dldEVkZ2VJbnRlcnNlY3Rpb24oYSwgYiwgY29kZU91dCwgYm91bmRzKTtcclxuXHRcdFx0XHRuZXdDb2RlID0gdGhpcy5fZ2V0Qml0Q29kZShwLCBib3VuZHMpO1xyXG5cclxuXHRcdFx0XHRpZiAoY29kZU91dCA9PT0gY29kZUEpIHtcclxuXHRcdFx0XHRcdGEgPSBwO1xyXG5cdFx0XHRcdFx0Y29kZUEgPSBuZXdDb2RlO1xyXG5cdFx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0XHRiID0gcDtcclxuXHRcdFx0XHRcdGNvZGVCID0gbmV3Q29kZTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfZ2V0RWRnZUludGVyc2VjdGlvbjogZnVuY3Rpb24gKGEsIGIsIGNvZGUsIGJvdW5kcykge1xyXG5cdFx0dmFyIGR4ID0gYi54IC0gYS54LFxyXG5cdFx0ICAgIGR5ID0gYi55IC0gYS55LFxyXG5cdFx0ICAgIG1pbiA9IGJvdW5kcy5taW4sXHJcblx0XHQgICAgbWF4ID0gYm91bmRzLm1heDtcclxuXHJcblx0XHRpZiAoY29kZSAmIDgpIHsgLy8gdG9wXHJcblx0XHRcdHJldHVybiBuZXcgTC5Qb2ludChhLnggKyBkeCAqIChtYXgueSAtIGEueSkgLyBkeSwgbWF4LnkpO1xyXG5cdFx0fSBlbHNlIGlmIChjb2RlICYgNCkgeyAvLyBib3R0b21cclxuXHRcdFx0cmV0dXJuIG5ldyBMLlBvaW50KGEueCArIGR4ICogKG1pbi55IC0gYS55KSAvIGR5LCBtaW4ueSk7XHJcblx0XHR9IGVsc2UgaWYgKGNvZGUgJiAyKSB7IC8vIHJpZ2h0XHJcblx0XHRcdHJldHVybiBuZXcgTC5Qb2ludChtYXgueCwgYS55ICsgZHkgKiAobWF4LnggLSBhLngpIC8gZHgpO1xyXG5cdFx0fSBlbHNlIGlmIChjb2RlICYgMSkgeyAvLyBsZWZ0XHJcblx0XHRcdHJldHVybiBuZXcgTC5Qb2ludChtaW4ueCwgYS55ICsgZHkgKiAobWluLnggLSBhLngpIC8gZHgpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdF9nZXRCaXRDb2RlOiBmdW5jdGlvbiAoLypQb2ludCovIHAsIGJvdW5kcykge1xyXG5cdFx0dmFyIGNvZGUgPSAwO1xyXG5cclxuXHRcdGlmIChwLnggPCBib3VuZHMubWluLngpIHsgLy8gbGVmdFxyXG5cdFx0XHRjb2RlIHw9IDE7XHJcblx0XHR9IGVsc2UgaWYgKHAueCA+IGJvdW5kcy5tYXgueCkgeyAvLyByaWdodFxyXG5cdFx0XHRjb2RlIHw9IDI7XHJcblx0XHR9XHJcblx0XHRpZiAocC55IDwgYm91bmRzLm1pbi55KSB7IC8vIGJvdHRvbVxyXG5cdFx0XHRjb2RlIHw9IDQ7XHJcblx0XHR9IGVsc2UgaWYgKHAueSA+IGJvdW5kcy5tYXgueSkgeyAvLyB0b3BcclxuXHRcdFx0Y29kZSB8PSA4O1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBjb2RlO1xyXG5cdH0sXHJcblxyXG5cdC8vIHNxdWFyZSBkaXN0YW5jZSAodG8gYXZvaWQgdW5uZWNlc3NhcnkgTWF0aC5zcXJ0IGNhbGxzKVxyXG5cdF9zcURpc3Q6IGZ1bmN0aW9uIChwMSwgcDIpIHtcclxuXHRcdHZhciBkeCA9IHAyLnggLSBwMS54LFxyXG5cdFx0ICAgIGR5ID0gcDIueSAtIHAxLnk7XHJcblx0XHRyZXR1cm4gZHggKiBkeCArIGR5ICogZHk7XHJcblx0fSxcclxuXHJcblx0Ly8gcmV0dXJuIGNsb3Nlc3QgcG9pbnQgb24gc2VnbWVudCBvciBkaXN0YW5jZSB0byB0aGF0IHBvaW50XHJcblx0X3NxQ2xvc2VzdFBvaW50T25TZWdtZW50OiBmdW5jdGlvbiAocCwgcDEsIHAyLCBzcURpc3QpIHtcclxuXHRcdHZhciB4ID0gcDEueCxcclxuXHRcdCAgICB5ID0gcDEueSxcclxuXHRcdCAgICBkeCA9IHAyLnggLSB4LFxyXG5cdFx0ICAgIGR5ID0gcDIueSAtIHksXHJcblx0XHQgICAgZG90ID0gZHggKiBkeCArIGR5ICogZHksXHJcblx0XHQgICAgdDtcclxuXHJcblx0XHRpZiAoZG90ID4gMCkge1xyXG5cdFx0XHR0ID0gKChwLnggLSB4KSAqIGR4ICsgKHAueSAtIHkpICogZHkpIC8gZG90O1xyXG5cclxuXHRcdFx0aWYgKHQgPiAxKSB7XHJcblx0XHRcdFx0eCA9IHAyLng7XHJcblx0XHRcdFx0eSA9IHAyLnk7XHJcblx0XHRcdH0gZWxzZSBpZiAodCA+IDApIHtcclxuXHRcdFx0XHR4ICs9IGR4ICogdDtcclxuXHRcdFx0XHR5ICs9IGR5ICogdDtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdGR4ID0gcC54IC0geDtcclxuXHRcdGR5ID0gcC55IC0geTtcclxuXHJcblx0XHRyZXR1cm4gc3FEaXN0ID8gZHggKiBkeCArIGR5ICogZHkgOiBuZXcgTC5Qb2ludCh4LCB5KTtcclxuXHR9XHJcbn07XHJcblxuXG4vKlxyXG4gKiBMLlBvbHlsaW5lIGlzIHVzZWQgdG8gZGlzcGxheSBwb2x5bGluZXMgb24gYSBtYXAuXHJcbiAqL1xyXG5cclxuTC5Qb2x5bGluZSA9IEwuUGF0aC5leHRlbmQoe1xyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChsYXRsbmdzLCBvcHRpb25zKSB7XHJcblx0XHRMLlBhdGgucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBvcHRpb25zKTtcclxuXHJcblx0XHR0aGlzLl9sYXRsbmdzID0gdGhpcy5fY29udmVydExhdExuZ3MobGF0bG5ncyk7XHJcblx0fSxcclxuXHJcblx0b3B0aW9uczoge1xyXG5cdFx0Ly8gaG93IG11Y2ggdG8gc2ltcGxpZnkgdGhlIHBvbHlsaW5lIG9uIGVhY2ggem9vbSBsZXZlbFxyXG5cdFx0Ly8gbW9yZSA9IGJldHRlciBwZXJmb3JtYW5jZSBhbmQgc21vb3RoZXIgbG9vaywgbGVzcyA9IG1vcmUgYWNjdXJhdGVcclxuXHRcdHNtb290aEZhY3RvcjogMS4wLFxyXG5cdFx0bm9DbGlwOiBmYWxzZVxyXG5cdH0sXHJcblxyXG5cdHByb2plY3RMYXRsbmdzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLl9vcmlnaW5hbFBvaW50cyA9IFtdO1xyXG5cclxuXHRcdGZvciAodmFyIGkgPSAwLCBsZW4gPSB0aGlzLl9sYXRsbmdzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdHRoaXMuX29yaWdpbmFsUG9pbnRzW2ldID0gdGhpcy5fbWFwLmxhdExuZ1RvTGF5ZXJQb2ludCh0aGlzLl9sYXRsbmdzW2ldKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRnZXRQYXRoU3RyaW5nOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRmb3IgKHZhciBpID0gMCwgbGVuID0gdGhpcy5fcGFydHMubGVuZ3RoLCBzdHIgPSAnJzsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdHN0ciArPSB0aGlzLl9nZXRQYXRoUGFydFN0cih0aGlzLl9wYXJ0c1tpXSk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gc3RyO1xyXG5cdH0sXHJcblxyXG5cdGdldExhdExuZ3M6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9sYXRsbmdzO1xyXG5cdH0sXHJcblxyXG5cdHNldExhdExuZ3M6IGZ1bmN0aW9uIChsYXRsbmdzKSB7XHJcblx0XHR0aGlzLl9sYXRsbmdzID0gdGhpcy5fY29udmVydExhdExuZ3MobGF0bG5ncyk7XHJcblx0XHRyZXR1cm4gdGhpcy5yZWRyYXcoKTtcclxuXHR9LFxyXG5cclxuXHRhZGRMYXRMbmc6IGZ1bmN0aW9uIChsYXRsbmcpIHtcclxuXHRcdHRoaXMuX2xhdGxuZ3MucHVzaChMLmxhdExuZyhsYXRsbmcpKTtcclxuXHRcdHJldHVybiB0aGlzLnJlZHJhdygpO1xyXG5cdH0sXHJcblxyXG5cdHNwbGljZUxhdExuZ3M6IGZ1bmN0aW9uICgpIHsgLy8gKE51bWJlciBpbmRleCwgTnVtYmVyIGhvd01hbnkpXHJcblx0XHR2YXIgcmVtb3ZlZCA9IFtdLnNwbGljZS5hcHBseSh0aGlzLl9sYXRsbmdzLCBhcmd1bWVudHMpO1xyXG5cdFx0dGhpcy5fY29udmVydExhdExuZ3ModGhpcy5fbGF0bG5ncywgdHJ1ZSk7XHJcblx0XHR0aGlzLnJlZHJhdygpO1xyXG5cdFx0cmV0dXJuIHJlbW92ZWQ7XHJcblx0fSxcclxuXHJcblx0Y2xvc2VzdExheWVyUG9pbnQ6IGZ1bmN0aW9uIChwKSB7XHJcblx0XHR2YXIgbWluRGlzdGFuY2UgPSBJbmZpbml0eSwgcGFydHMgPSB0aGlzLl9wYXJ0cywgcDEsIHAyLCBtaW5Qb2ludCA9IG51bGw7XHJcblxyXG5cdFx0Zm9yICh2YXIgaiA9IDAsIGpMZW4gPSBwYXJ0cy5sZW5ndGg7IGogPCBqTGVuOyBqKyspIHtcclxuXHRcdFx0dmFyIHBvaW50cyA9IHBhcnRzW2pdO1xyXG5cdFx0XHRmb3IgKHZhciBpID0gMSwgbGVuID0gcG9pbnRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdFx0cDEgPSBwb2ludHNbaSAtIDFdO1xyXG5cdFx0XHRcdHAyID0gcG9pbnRzW2ldO1xyXG5cdFx0XHRcdHZhciBzcURpc3QgPSBMLkxpbmVVdGlsLl9zcUNsb3Nlc3RQb2ludE9uU2VnbWVudChwLCBwMSwgcDIsIHRydWUpO1xyXG5cdFx0XHRcdGlmIChzcURpc3QgPCBtaW5EaXN0YW5jZSkge1xyXG5cdFx0XHRcdFx0bWluRGlzdGFuY2UgPSBzcURpc3Q7XHJcblx0XHRcdFx0XHRtaW5Qb2ludCA9IEwuTGluZVV0aWwuX3NxQ2xvc2VzdFBvaW50T25TZWdtZW50KHAsIHAxLCBwMik7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRpZiAobWluUG9pbnQpIHtcclxuXHRcdFx0bWluUG9pbnQuZGlzdGFuY2UgPSBNYXRoLnNxcnQobWluRGlzdGFuY2UpO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIG1pblBvaW50O1xyXG5cdH0sXHJcblxyXG5cdGdldEJvdW5kczogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIG5ldyBMLkxhdExuZ0JvdW5kcyh0aGlzLmdldExhdExuZ3MoKSk7XHJcblx0fSxcclxuXHJcblx0X2NvbnZlcnRMYXRMbmdzOiBmdW5jdGlvbiAobGF0bG5ncywgb3ZlcndyaXRlKSB7XHJcblx0XHR2YXIgaSwgbGVuLCB0YXJnZXQgPSBvdmVyd3JpdGUgPyBsYXRsbmdzIDogW107XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gbGF0bG5ncy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHRpZiAoTC5VdGlsLmlzQXJyYXkobGF0bG5nc1tpXSkgJiYgdHlwZW9mIGxhdGxuZ3NbaV1bMF0gIT09ICdudW1iZXInKSB7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblx0XHRcdHRhcmdldFtpXSA9IEwubGF0TG5nKGxhdGxuZ3NbaV0pO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRhcmdldDtcclxuXHR9LFxyXG5cclxuXHRfaW5pdEV2ZW50czogZnVuY3Rpb24gKCkge1xyXG5cdFx0TC5QYXRoLnByb3RvdHlwZS5faW5pdEV2ZW50cy5jYWxsKHRoaXMpO1xyXG5cdH0sXHJcblxyXG5cdF9nZXRQYXRoUGFydFN0cjogZnVuY3Rpb24gKHBvaW50cykge1xyXG5cdFx0dmFyIHJvdW5kID0gTC5QYXRoLlZNTDtcclxuXHJcblx0XHRmb3IgKHZhciBqID0gMCwgbGVuMiA9IHBvaW50cy5sZW5ndGgsIHN0ciA9ICcnLCBwOyBqIDwgbGVuMjsgaisrKSB7XHJcblx0XHRcdHAgPSBwb2ludHNbal07XHJcblx0XHRcdGlmIChyb3VuZCkge1xyXG5cdFx0XHRcdHAuX3JvdW5kKCk7XHJcblx0XHRcdH1cclxuXHRcdFx0c3RyICs9IChqID8gJ0wnIDogJ00nKSArIHAueCArICcgJyArIHAueTtcclxuXHRcdH1cclxuXHRcdHJldHVybiBzdHI7XHJcblx0fSxcclxuXHJcblx0X2NsaXBQb2ludHM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBwb2ludHMgPSB0aGlzLl9vcmlnaW5hbFBvaW50cyxcclxuXHRcdCAgICBsZW4gPSBwb2ludHMubGVuZ3RoLFxyXG5cdFx0ICAgIGksIGssIHNlZ21lbnQ7XHJcblxyXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5ub0NsaXApIHtcclxuXHRcdFx0dGhpcy5fcGFydHMgPSBbcG9pbnRzXTtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3BhcnRzID0gW107XHJcblxyXG5cdFx0dmFyIHBhcnRzID0gdGhpcy5fcGFydHMsXHJcblx0XHQgICAgdnAgPSB0aGlzLl9tYXAuX3BhdGhWaWV3cG9ydCxcclxuXHRcdCAgICBsdSA9IEwuTGluZVV0aWw7XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgayA9IDA7IGkgPCBsZW4gLSAxOyBpKyspIHtcclxuXHRcdFx0c2VnbWVudCA9IGx1LmNsaXBTZWdtZW50KHBvaW50c1tpXSwgcG9pbnRzW2kgKyAxXSwgdnAsIGkpO1xyXG5cdFx0XHRpZiAoIXNlZ21lbnQpIHtcclxuXHRcdFx0XHRjb250aW51ZTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0cGFydHNba10gPSBwYXJ0c1trXSB8fCBbXTtcclxuXHRcdFx0cGFydHNba10ucHVzaChzZWdtZW50WzBdKTtcclxuXHJcblx0XHRcdC8vIGlmIHNlZ21lbnQgZ29lcyBvdXQgb2Ygc2NyZWVuLCBvciBpdCdzIHRoZSBsYXN0IG9uZSwgaXQncyB0aGUgZW5kIG9mIHRoZSBsaW5lIHBhcnRcclxuXHRcdFx0aWYgKChzZWdtZW50WzFdICE9PSBwb2ludHNbaSArIDFdKSB8fCAoaSA9PT0gbGVuIC0gMikpIHtcclxuXHRcdFx0XHRwYXJ0c1trXS5wdXNoKHNlZ21lbnRbMV0pO1xyXG5cdFx0XHRcdGsrKztcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdC8vIHNpbXBsaWZ5IGVhY2ggY2xpcHBlZCBwYXJ0IG9mIHRoZSBwb2x5bGluZVxyXG5cdF9zaW1wbGlmeVBvaW50czogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIHBhcnRzID0gdGhpcy5fcGFydHMsXHJcblx0XHQgICAgbHUgPSBMLkxpbmVVdGlsO1xyXG5cclxuXHRcdGZvciAodmFyIGkgPSAwLCBsZW4gPSBwYXJ0cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHRwYXJ0c1tpXSA9IGx1LnNpbXBsaWZ5KHBhcnRzW2ldLCB0aGlzLm9wdGlvbnMuc21vb3RoRmFjdG9yKTtcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRfdXBkYXRlUGF0aDogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9tYXApIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dGhpcy5fY2xpcFBvaW50cygpO1xyXG5cdFx0dGhpcy5fc2ltcGxpZnlQb2ludHMoKTtcclxuXHJcblx0XHRMLlBhdGgucHJvdG90eXBlLl91cGRhdGVQYXRoLmNhbGwodGhpcyk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwucG9seWxpbmUgPSBmdW5jdGlvbiAobGF0bG5ncywgb3B0aW9ucykge1xyXG5cdHJldHVybiBuZXcgTC5Qb2x5bGluZShsYXRsbmdzLCBvcHRpb25zKTtcclxufTtcclxuXG5cbi8qXHJcbiAqIEwuUG9seVV0aWwgY29udGFpbnMgdXRpbGl0eSBmdW5jdGlvbnMgZm9yIHBvbHlnb25zIChjbGlwcGluZywgZXRjLikuXHJcbiAqL1xyXG5cclxuLypqc2hpbnQgYml0d2lzZTpmYWxzZSAqLyAvLyBhbGxvdyBiaXR3aXNlIG9wZXJhdGlvbnMgaGVyZVxyXG5cclxuTC5Qb2x5VXRpbCA9IHt9O1xyXG5cclxuLypcclxuICogU3V0aGVybGFuZC1Ib2RnZW1hbiBwb2x5Z29uIGNsaXBwaW5nIGFsZ29yaXRobS5cclxuICogVXNlZCB0byBhdm9pZCByZW5kZXJpbmcgcGFydHMgb2YgYSBwb2x5Z29uIHRoYXQgYXJlIG5vdCBjdXJyZW50bHkgdmlzaWJsZS5cclxuICovXHJcbkwuUG9seVV0aWwuY2xpcFBvbHlnb24gPSBmdW5jdGlvbiAocG9pbnRzLCBib3VuZHMpIHtcclxuXHR2YXIgY2xpcHBlZFBvaW50cyxcclxuXHQgICAgZWRnZXMgPSBbMSwgNCwgMiwgOF0sXHJcblx0ICAgIGksIGosIGssXHJcblx0ICAgIGEsIGIsXHJcblx0ICAgIGxlbiwgZWRnZSwgcCxcclxuXHQgICAgbHUgPSBMLkxpbmVVdGlsO1xyXG5cclxuXHRmb3IgKGkgPSAwLCBsZW4gPSBwb2ludHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdHBvaW50c1tpXS5fY29kZSA9IGx1Ll9nZXRCaXRDb2RlKHBvaW50c1tpXSwgYm91bmRzKTtcclxuXHR9XHJcblxyXG5cdC8vIGZvciBlYWNoIGVkZ2UgKGxlZnQsIGJvdHRvbSwgcmlnaHQsIHRvcClcclxuXHRmb3IgKGsgPSAwOyBrIDwgNDsgaysrKSB7XHJcblx0XHRlZGdlID0gZWRnZXNba107XHJcblx0XHRjbGlwcGVkUG9pbnRzID0gW107XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gcG9pbnRzLmxlbmd0aCwgaiA9IGxlbiAtIDE7IGkgPCBsZW47IGogPSBpKyspIHtcclxuXHRcdFx0YSA9IHBvaW50c1tpXTtcclxuXHRcdFx0YiA9IHBvaW50c1tqXTtcclxuXHJcblx0XHRcdC8vIGlmIGEgaXMgaW5zaWRlIHRoZSBjbGlwIHdpbmRvd1xyXG5cdFx0XHRpZiAoIShhLl9jb2RlICYgZWRnZSkpIHtcclxuXHRcdFx0XHQvLyBpZiBiIGlzIG91dHNpZGUgdGhlIGNsaXAgd2luZG93IChhLT5iIGdvZXMgb3V0IG9mIHNjcmVlbilcclxuXHRcdFx0XHRpZiAoYi5fY29kZSAmIGVkZ2UpIHtcclxuXHRcdFx0XHRcdHAgPSBsdS5fZ2V0RWRnZUludGVyc2VjdGlvbihiLCBhLCBlZGdlLCBib3VuZHMpO1xyXG5cdFx0XHRcdFx0cC5fY29kZSA9IGx1Ll9nZXRCaXRDb2RlKHAsIGJvdW5kcyk7XHJcblx0XHRcdFx0XHRjbGlwcGVkUG9pbnRzLnB1c2gocCk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGNsaXBwZWRQb2ludHMucHVzaChhKTtcclxuXHJcblx0XHRcdC8vIGVsc2UgaWYgYiBpcyBpbnNpZGUgdGhlIGNsaXAgd2luZG93IChhLT5iIGVudGVycyB0aGUgc2NyZWVuKVxyXG5cdFx0XHR9IGVsc2UgaWYgKCEoYi5fY29kZSAmIGVkZ2UpKSB7XHJcblx0XHRcdFx0cCA9IGx1Ll9nZXRFZGdlSW50ZXJzZWN0aW9uKGIsIGEsIGVkZ2UsIGJvdW5kcyk7XHJcblx0XHRcdFx0cC5fY29kZSA9IGx1Ll9nZXRCaXRDb2RlKHAsIGJvdW5kcyk7XHJcblx0XHRcdFx0Y2xpcHBlZFBvaW50cy5wdXNoKHApO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRwb2ludHMgPSBjbGlwcGVkUG9pbnRzO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIHBvaW50cztcclxufTtcclxuXG5cbi8qXHJcbiAqIEwuUG9seWdvbiBpcyB1c2VkIHRvIGRpc3BsYXkgcG9seWdvbnMgb24gYSBtYXAuXHJcbiAqL1xyXG5cclxuTC5Qb2x5Z29uID0gTC5Qb2x5bGluZS5leHRlbmQoe1xyXG5cdG9wdGlvbnM6IHtcclxuXHRcdGZpbGw6IHRydWVcclxuXHR9LFxyXG5cclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAobGF0bG5ncywgb3B0aW9ucykge1xyXG5cdFx0TC5Qb2x5bGluZS5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIGxhdGxuZ3MsIG9wdGlvbnMpO1xyXG5cdFx0dGhpcy5faW5pdFdpdGhIb2xlcyhsYXRsbmdzKTtcclxuXHR9LFxyXG5cclxuXHRfaW5pdFdpdGhIb2xlczogZnVuY3Rpb24gKGxhdGxuZ3MpIHtcclxuXHRcdHZhciBpLCBsZW4sIGhvbGU7XHJcblx0XHRpZiAobGF0bG5ncyAmJiBMLlV0aWwuaXNBcnJheShsYXRsbmdzWzBdKSAmJiAodHlwZW9mIGxhdGxuZ3NbMF1bMF0gIT09ICdudW1iZXInKSkge1xyXG5cdFx0XHR0aGlzLl9sYXRsbmdzID0gdGhpcy5fY29udmVydExhdExuZ3MobGF0bG5nc1swXSk7XHJcblx0XHRcdHRoaXMuX2hvbGVzID0gbGF0bG5ncy5zbGljZSgxKTtcclxuXHJcblx0XHRcdGZvciAoaSA9IDAsIGxlbiA9IHRoaXMuX2hvbGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdFx0aG9sZSA9IHRoaXMuX2hvbGVzW2ldID0gdGhpcy5fY29udmVydExhdExuZ3ModGhpcy5faG9sZXNbaV0pO1xyXG5cdFx0XHRcdGlmIChob2xlWzBdLmVxdWFscyhob2xlW2hvbGUubGVuZ3RoIC0gMV0pKSB7XHJcblx0XHRcdFx0XHRob2xlLnBvcCgpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdC8vIGZpbHRlciBvdXQgbGFzdCBwb2ludCBpZiBpdHMgZXF1YWwgdG8gdGhlIGZpcnN0IG9uZVxyXG5cdFx0bGF0bG5ncyA9IHRoaXMuX2xhdGxuZ3M7XHJcblxyXG5cdFx0aWYgKGxhdGxuZ3MubGVuZ3RoID49IDIgJiYgbGF0bG5nc1swXS5lcXVhbHMobGF0bG5nc1tsYXRsbmdzLmxlbmd0aCAtIDFdKSkge1xyXG5cdFx0XHRsYXRsbmdzLnBvcCgpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdHByb2plY3RMYXRsbmdzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRMLlBvbHlsaW5lLnByb3RvdHlwZS5wcm9qZWN0TGF0bG5ncy5jYWxsKHRoaXMpO1xyXG5cclxuXHRcdC8vIHByb2plY3QgcG9seWdvbiBob2xlcyBwb2ludHNcclxuXHRcdC8vIFRPRE8gbW92ZSB0aGlzIGxvZ2ljIHRvIFBvbHlsaW5lIHRvIGdldCByaWQgb2YgZHVwbGljYXRpb25cclxuXHRcdHRoaXMuX2hvbGVQb2ludHMgPSBbXTtcclxuXHJcblx0XHRpZiAoIXRoaXMuX2hvbGVzKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdHZhciBpLCBqLCBsZW4sIGxlbjI7XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gdGhpcy5faG9sZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0dGhpcy5faG9sZVBvaW50c1tpXSA9IFtdO1xyXG5cclxuXHRcdFx0Zm9yIChqID0gMCwgbGVuMiA9IHRoaXMuX2hvbGVzW2ldLmxlbmd0aDsgaiA8IGxlbjI7IGorKykge1xyXG5cdFx0XHRcdHRoaXMuX2hvbGVQb2ludHNbaV1bal0gPSB0aGlzLl9tYXAubGF0TG5nVG9MYXllclBvaW50KHRoaXMuX2hvbGVzW2ldW2pdKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdHNldExhdExuZ3M6IGZ1bmN0aW9uIChsYXRsbmdzKSB7XHJcblx0XHRpZiAobGF0bG5ncyAmJiBMLlV0aWwuaXNBcnJheShsYXRsbmdzWzBdKSAmJiAodHlwZW9mIGxhdGxuZ3NbMF1bMF0gIT09ICdudW1iZXInKSkge1xyXG5cdFx0XHR0aGlzLl9pbml0V2l0aEhvbGVzKGxhdGxuZ3MpO1xyXG5cdFx0XHRyZXR1cm4gdGhpcy5yZWRyYXcoKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHJldHVybiBMLlBvbHlsaW5lLnByb3RvdHlwZS5zZXRMYXRMbmdzLmNhbGwodGhpcywgbGF0bG5ncyk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X2NsaXBQb2ludHM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBwb2ludHMgPSB0aGlzLl9vcmlnaW5hbFBvaW50cyxcclxuXHRcdCAgICBuZXdQYXJ0cyA9IFtdO1xyXG5cclxuXHRcdHRoaXMuX3BhcnRzID0gW3BvaW50c10uY29uY2F0KHRoaXMuX2hvbGVQb2ludHMpO1xyXG5cclxuXHRcdGlmICh0aGlzLm9wdGlvbnMubm9DbGlwKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdGZvciAodmFyIGkgPSAwLCBsZW4gPSB0aGlzLl9wYXJ0cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHR2YXIgY2xpcHBlZCA9IEwuUG9seVV0aWwuY2xpcFBvbHlnb24odGhpcy5fcGFydHNbaV0sIHRoaXMuX21hcC5fcGF0aFZpZXdwb3J0KTtcclxuXHRcdFx0aWYgKGNsaXBwZWQubGVuZ3RoKSB7XHJcblx0XHRcdFx0bmV3UGFydHMucHVzaChjbGlwcGVkKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3BhcnRzID0gbmV3UGFydHM7XHJcblx0fSxcclxuXHJcblx0X2dldFBhdGhQYXJ0U3RyOiBmdW5jdGlvbiAocG9pbnRzKSB7XHJcblx0XHR2YXIgc3RyID0gTC5Qb2x5bGluZS5wcm90b3R5cGUuX2dldFBhdGhQYXJ0U3RyLmNhbGwodGhpcywgcG9pbnRzKTtcclxuXHRcdHJldHVybiBzdHIgKyAoTC5Ccm93c2VyLnN2ZyA/ICd6JyA6ICd4Jyk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwucG9seWdvbiA9IGZ1bmN0aW9uIChsYXRsbmdzLCBvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLlBvbHlnb24obGF0bG5ncywgb3B0aW9ucyk7XHJcbn07XHJcblxuXG4vKlxyXG4gKiBDb250YWlucyBMLk11bHRpUG9seWxpbmUgYW5kIEwuTXVsdGlQb2x5Z29uIGxheWVycy5cclxuICovXHJcblxyXG4oZnVuY3Rpb24gKCkge1xyXG5cdGZ1bmN0aW9uIGNyZWF0ZU11bHRpKEtsYXNzKSB7XHJcblxyXG5cdFx0cmV0dXJuIEwuRmVhdHVyZUdyb3VwLmV4dGVuZCh7XHJcblxyXG5cdFx0XHRpbml0aWFsaXplOiBmdW5jdGlvbiAobGF0bG5ncywgb3B0aW9ucykge1xyXG5cdFx0XHRcdHRoaXMuX2xheWVycyA9IHt9O1xyXG5cdFx0XHRcdHRoaXMuX29wdGlvbnMgPSBvcHRpb25zO1xyXG5cdFx0XHRcdHRoaXMuc2V0TGF0TG5ncyhsYXRsbmdzKTtcclxuXHRcdFx0fSxcclxuXHJcblx0XHRcdHNldExhdExuZ3M6IGZ1bmN0aW9uIChsYXRsbmdzKSB7XHJcblx0XHRcdFx0dmFyIGkgPSAwLFxyXG5cdFx0XHRcdCAgICBsZW4gPSBsYXRsbmdzLmxlbmd0aDtcclxuXHJcblx0XHRcdFx0dGhpcy5lYWNoTGF5ZXIoZnVuY3Rpb24gKGxheWVyKSB7XHJcblx0XHRcdFx0XHRpZiAoaSA8IGxlbikge1xyXG5cdFx0XHRcdFx0XHRsYXllci5zZXRMYXRMbmdzKGxhdGxuZ3NbaSsrXSk7XHJcblx0XHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0XHR0aGlzLnJlbW92ZUxheWVyKGxheWVyKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9LCB0aGlzKTtcclxuXHJcblx0XHRcdFx0d2hpbGUgKGkgPCBsZW4pIHtcclxuXHRcdFx0XHRcdHRoaXMuYWRkTGF5ZXIobmV3IEtsYXNzKGxhdGxuZ3NbaSsrXSwgdGhpcy5fb3B0aW9ucykpO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0cmV0dXJuIHRoaXM7XHJcblx0XHRcdH0sXHJcblxyXG5cdFx0XHRnZXRMYXRMbmdzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRcdFx0dmFyIGxhdGxuZ3MgPSBbXTtcclxuXHJcblx0XHRcdFx0dGhpcy5lYWNoTGF5ZXIoZnVuY3Rpb24gKGxheWVyKSB7XHJcblx0XHRcdFx0XHRsYXRsbmdzLnB1c2gobGF5ZXIuZ2V0TGF0TG5ncygpKTtcclxuXHRcdFx0XHR9KTtcclxuXHJcblx0XHRcdFx0cmV0dXJuIGxhdGxuZ3M7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0TC5NdWx0aVBvbHlsaW5lID0gY3JlYXRlTXVsdGkoTC5Qb2x5bGluZSk7XHJcblx0TC5NdWx0aVBvbHlnb24gPSBjcmVhdGVNdWx0aShMLlBvbHlnb24pO1xyXG5cclxuXHRMLm11bHRpUG9seWxpbmUgPSBmdW5jdGlvbiAobGF0bG5ncywgb3B0aW9ucykge1xyXG5cdFx0cmV0dXJuIG5ldyBMLk11bHRpUG9seWxpbmUobGF0bG5ncywgb3B0aW9ucyk7XHJcblx0fTtcclxuXHJcblx0TC5tdWx0aVBvbHlnb24gPSBmdW5jdGlvbiAobGF0bG5ncywgb3B0aW9ucykge1xyXG5cdFx0cmV0dXJuIG5ldyBMLk11bHRpUG9seWdvbihsYXRsbmdzLCBvcHRpb25zKTtcclxuXHR9O1xyXG59KCkpO1xyXG5cblxuLypcclxuICogTC5SZWN0YW5nbGUgZXh0ZW5kcyBQb2x5Z29uIGFuZCBjcmVhdGVzIGEgcmVjdGFuZ2xlIHdoZW4gcGFzc2VkIGEgTGF0TG5nQm91bmRzIG9iamVjdC5cclxuICovXHJcblxyXG5MLlJlY3RhbmdsZSA9IEwuUG9seWdvbi5leHRlbmQoe1xyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChsYXRMbmdCb3VuZHMsIG9wdGlvbnMpIHtcclxuXHRcdEwuUG9seWdvbi5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIHRoaXMuX2JvdW5kc1RvTGF0TG5ncyhsYXRMbmdCb3VuZHMpLCBvcHRpb25zKTtcclxuXHR9LFxyXG5cclxuXHRzZXRCb3VuZHM6IGZ1bmN0aW9uIChsYXRMbmdCb3VuZHMpIHtcclxuXHRcdHRoaXMuc2V0TGF0TG5ncyh0aGlzLl9ib3VuZHNUb0xhdExuZ3MobGF0TG5nQm91bmRzKSk7XHJcblx0fSxcclxuXHJcblx0X2JvdW5kc1RvTGF0TG5nczogZnVuY3Rpb24gKGxhdExuZ0JvdW5kcykge1xyXG5cdFx0bGF0TG5nQm91bmRzID0gTC5sYXRMbmdCb3VuZHMobGF0TG5nQm91bmRzKTtcclxuXHRcdHJldHVybiBbXHJcblx0XHRcdGxhdExuZ0JvdW5kcy5nZXRTb3V0aFdlc3QoKSxcclxuXHRcdFx0bGF0TG5nQm91bmRzLmdldE5vcnRoV2VzdCgpLFxyXG5cdFx0XHRsYXRMbmdCb3VuZHMuZ2V0Tm9ydGhFYXN0KCksXHJcblx0XHRcdGxhdExuZ0JvdW5kcy5nZXRTb3V0aEVhc3QoKVxyXG5cdFx0XTtcclxuXHR9XHJcbn0pO1xyXG5cclxuTC5yZWN0YW5nbGUgPSBmdW5jdGlvbiAobGF0TG5nQm91bmRzLCBvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLlJlY3RhbmdsZShsYXRMbmdCb3VuZHMsIG9wdGlvbnMpO1xyXG59O1xyXG5cblxuLypcclxuICogTC5DaXJjbGUgaXMgYSBjaXJjbGUgb3ZlcmxheSAod2l0aCBhIGNlcnRhaW4gcmFkaXVzIGluIG1ldGVycykuXHJcbiAqL1xyXG5cclxuTC5DaXJjbGUgPSBMLlBhdGguZXh0ZW5kKHtcclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAobGF0bG5nLCByYWRpdXMsIG9wdGlvbnMpIHtcclxuXHRcdEwuUGF0aC5wcm90b3R5cGUuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIG9wdGlvbnMpO1xyXG5cclxuXHRcdHRoaXMuX2xhdGxuZyA9IEwubGF0TG5nKGxhdGxuZyk7XHJcblx0XHR0aGlzLl9tUmFkaXVzID0gcmFkaXVzO1xyXG5cdH0sXHJcblxyXG5cdG9wdGlvbnM6IHtcclxuXHRcdGZpbGw6IHRydWVcclxuXHR9LFxyXG5cclxuXHRzZXRMYXRMbmc6IGZ1bmN0aW9uIChsYXRsbmcpIHtcclxuXHRcdHRoaXMuX2xhdGxuZyA9IEwubGF0TG5nKGxhdGxuZyk7XHJcblx0XHRyZXR1cm4gdGhpcy5yZWRyYXcoKTtcclxuXHR9LFxyXG5cclxuXHRzZXRSYWRpdXM6IGZ1bmN0aW9uIChyYWRpdXMpIHtcclxuXHRcdHRoaXMuX21SYWRpdXMgPSByYWRpdXM7XHJcblx0XHRyZXR1cm4gdGhpcy5yZWRyYXcoKTtcclxuXHR9LFxyXG5cclxuXHRwcm9qZWN0TGF0bG5nczogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGxuZ1JhZGl1cyA9IHRoaXMuX2dldExuZ1JhZGl1cygpLFxyXG5cdFx0ICAgIGxhdGxuZyA9IHRoaXMuX2xhdGxuZyxcclxuXHRcdCAgICBwb2ludExlZnQgPSB0aGlzLl9tYXAubGF0TG5nVG9MYXllclBvaW50KFtsYXRsbmcubGF0LCBsYXRsbmcubG5nIC0gbG5nUmFkaXVzXSk7XHJcblxyXG5cdFx0dGhpcy5fcG9pbnQgPSB0aGlzLl9tYXAubGF0TG5nVG9MYXllclBvaW50KGxhdGxuZyk7XHJcblx0XHR0aGlzLl9yYWRpdXMgPSBNYXRoLm1heCh0aGlzLl9wb2ludC54IC0gcG9pbnRMZWZ0LngsIDEpO1xyXG5cdH0sXHJcblxyXG5cdGdldEJvdW5kczogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGxuZ1JhZGl1cyA9IHRoaXMuX2dldExuZ1JhZGl1cygpLFxyXG5cdFx0ICAgIGxhdFJhZGl1cyA9ICh0aGlzLl9tUmFkaXVzIC8gNDAwNzUwMTcpICogMzYwLFxyXG5cdFx0ICAgIGxhdGxuZyA9IHRoaXMuX2xhdGxuZztcclxuXHJcblx0XHRyZXR1cm4gbmV3IEwuTGF0TG5nQm91bmRzKFxyXG5cdFx0ICAgICAgICBbbGF0bG5nLmxhdCAtIGxhdFJhZGl1cywgbGF0bG5nLmxuZyAtIGxuZ1JhZGl1c10sXHJcblx0XHQgICAgICAgIFtsYXRsbmcubGF0ICsgbGF0UmFkaXVzLCBsYXRsbmcubG5nICsgbG5nUmFkaXVzXSk7XHJcblx0fSxcclxuXHJcblx0Z2V0TGF0TG5nOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fbGF0bG5nO1xyXG5cdH0sXHJcblxyXG5cdGdldFBhdGhTdHJpbmc6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBwID0gdGhpcy5fcG9pbnQsXHJcblx0XHQgICAgciA9IHRoaXMuX3JhZGl1cztcclxuXHJcblx0XHRpZiAodGhpcy5fY2hlY2tJZkVtcHR5KCkpIHtcclxuXHRcdFx0cmV0dXJuICcnO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChMLkJyb3dzZXIuc3ZnKSB7XHJcblx0XHRcdHJldHVybiAnTScgKyBwLnggKyAnLCcgKyAocC55IC0gcikgK1xyXG5cdFx0XHQgICAgICAgJ0EnICsgciArICcsJyArIHIgKyAnLDAsMSwxLCcgK1xyXG5cdFx0XHQgICAgICAgKHAueCAtIDAuMSkgKyAnLCcgKyAocC55IC0gcikgKyAnIHonO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0cC5fcm91bmQoKTtcclxuXHRcdFx0ciA9IE1hdGgucm91bmQocik7XHJcblx0XHRcdHJldHVybiAnQUwgJyArIHAueCArICcsJyArIHAueSArICcgJyArIHIgKyAnLCcgKyByICsgJyAwLCcgKyAoNjU1MzUgKiAzNjApO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGdldFJhZGl1czogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX21SYWRpdXM7XHJcblx0fSxcclxuXHJcblx0Ly8gVE9ETyBFYXJ0aCBoYXJkY29kZWQsIG1vdmUgaW50byBwcm9qZWN0aW9uIGNvZGUhXHJcblxyXG5cdF9nZXRMYXRSYWRpdXM6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiAodGhpcy5fbVJhZGl1cyAvIDQwMDc1MDE3KSAqIDM2MDtcclxuXHR9LFxyXG5cclxuXHRfZ2V0TG5nUmFkaXVzOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fZ2V0TGF0UmFkaXVzKCkgLyBNYXRoLmNvcyhMLkxhdExuZy5ERUdfVE9fUkFEICogdGhpcy5fbGF0bG5nLmxhdCk7XHJcblx0fSxcclxuXHJcblx0X2NoZWNrSWZFbXB0eTogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9tYXApIHtcclxuXHRcdFx0cmV0dXJuIGZhbHNlO1xyXG5cdFx0fVxyXG5cdFx0dmFyIHZwID0gdGhpcy5fbWFwLl9wYXRoVmlld3BvcnQsXHJcblx0XHQgICAgciA9IHRoaXMuX3JhZGl1cyxcclxuXHRcdCAgICBwID0gdGhpcy5fcG9pbnQ7XHJcblxyXG5cdFx0cmV0dXJuIHAueCAtIHIgPiB2cC5tYXgueCB8fCBwLnkgLSByID4gdnAubWF4LnkgfHxcclxuXHRcdCAgICAgICBwLnggKyByIDwgdnAubWluLnggfHwgcC55ICsgciA8IHZwLm1pbi55O1xyXG5cdH1cclxufSk7XHJcblxyXG5MLmNpcmNsZSA9IGZ1bmN0aW9uIChsYXRsbmcsIHJhZGl1cywgb3B0aW9ucykge1xyXG5cdHJldHVybiBuZXcgTC5DaXJjbGUobGF0bG5nLCByYWRpdXMsIG9wdGlvbnMpO1xyXG59O1xyXG5cblxuLypcclxuICogTC5DaXJjbGVNYXJrZXIgaXMgYSBjaXJjbGUgb3ZlcmxheSB3aXRoIGEgcGVybWFuZW50IHBpeGVsIHJhZGl1cy5cclxuICovXHJcblxyXG5MLkNpcmNsZU1hcmtlciA9IEwuQ2lyY2xlLmV4dGVuZCh7XHJcblx0b3B0aW9uczoge1xyXG5cdFx0cmFkaXVzOiAxMCxcclxuXHRcdHdlaWdodDogMlxyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChsYXRsbmcsIG9wdGlvbnMpIHtcclxuXHRcdEwuQ2lyY2xlLnByb3RvdHlwZS5pbml0aWFsaXplLmNhbGwodGhpcywgbGF0bG5nLCBudWxsLCBvcHRpb25zKTtcclxuXHRcdHRoaXMuX3JhZGl1cyA9IHRoaXMub3B0aW9ucy5yYWRpdXM7XHJcblx0fSxcclxuXHJcblx0cHJvamVjdExhdGxuZ3M6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHRoaXMuX3BvaW50ID0gdGhpcy5fbWFwLmxhdExuZ1RvTGF5ZXJQb2ludCh0aGlzLl9sYXRsbmcpO1xyXG5cdH0sXHJcblxyXG5cdF91cGRhdGVTdHlsZSA6IGZ1bmN0aW9uICgpIHtcclxuXHRcdEwuQ2lyY2xlLnByb3RvdHlwZS5fdXBkYXRlU3R5bGUuY2FsbCh0aGlzKTtcclxuXHRcdHRoaXMuc2V0UmFkaXVzKHRoaXMub3B0aW9ucy5yYWRpdXMpO1xyXG5cdH0sXHJcblxyXG5cdHNldExhdExuZzogZnVuY3Rpb24gKGxhdGxuZykge1xyXG5cdFx0TC5DaXJjbGUucHJvdG90eXBlLnNldExhdExuZy5jYWxsKHRoaXMsIGxhdGxuZyk7XHJcblx0XHRpZiAodGhpcy5fcG9wdXAgJiYgdGhpcy5fcG9wdXAuX2lzT3Blbikge1xyXG5cdFx0XHR0aGlzLl9wb3B1cC5zZXRMYXRMbmcobGF0bG5nKTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHNldFJhZGl1czogZnVuY3Rpb24gKHJhZGl1cykge1xyXG5cdFx0dGhpcy5vcHRpb25zLnJhZGl1cyA9IHRoaXMuX3JhZGl1cyA9IHJhZGl1cztcclxuXHRcdHJldHVybiB0aGlzLnJlZHJhdygpO1xyXG5cdH0sXHJcblxyXG5cdGdldFJhZGl1czogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX3JhZGl1cztcclxuXHR9XHJcbn0pO1xyXG5cclxuTC5jaXJjbGVNYXJrZXIgPSBmdW5jdGlvbiAobGF0bG5nLCBvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLkNpcmNsZU1hcmtlcihsYXRsbmcsIG9wdGlvbnMpO1xyXG59O1xyXG5cblxuLypcclxuICogRXh0ZW5kcyBMLlBvbHlsaW5lIHRvIGJlIGFibGUgdG8gbWFudWFsbHkgZGV0ZWN0IGNsaWNrcyBvbiBDYW52YXMtcmVuZGVyZWQgcG9seWxpbmVzLlxyXG4gKi9cclxuXHJcbkwuUG9seWxpbmUuaW5jbHVkZSghTC5QYXRoLkNBTlZBUyA/IHt9IDoge1xyXG5cdF9jb250YWluc1BvaW50OiBmdW5jdGlvbiAocCwgY2xvc2VkKSB7XHJcblx0XHR2YXIgaSwgaiwgaywgbGVuLCBsZW4yLCBkaXN0LCBwYXJ0LFxyXG5cdFx0ICAgIHcgPSB0aGlzLm9wdGlvbnMud2VpZ2h0IC8gMjtcclxuXHJcblx0XHRpZiAoTC5Ccm93c2VyLnRvdWNoKSB7XHJcblx0XHRcdHcgKz0gMTA7IC8vIHBvbHlsaW5lIGNsaWNrIHRvbGVyYW5jZSBvbiB0b3VjaCBkZXZpY2VzXHJcblx0XHR9XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gdGhpcy5fcGFydHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0cGFydCA9IHRoaXMuX3BhcnRzW2ldO1xyXG5cdFx0XHRmb3IgKGogPSAwLCBsZW4yID0gcGFydC5sZW5ndGgsIGsgPSBsZW4yIC0gMTsgaiA8IGxlbjI7IGsgPSBqKyspIHtcclxuXHRcdFx0XHRpZiAoIWNsb3NlZCAmJiAoaiA9PT0gMCkpIHtcclxuXHRcdFx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0ZGlzdCA9IEwuTGluZVV0aWwucG9pbnRUb1NlZ21lbnREaXN0YW5jZShwLCBwYXJ0W2tdLCBwYXJ0W2pdKTtcclxuXHJcblx0XHRcdFx0aWYgKGRpc3QgPD0gdykge1xyXG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gZmFsc2U7XHJcblx0fVxyXG59KTtcclxuXG5cbi8qXHJcbiAqIEV4dGVuZHMgTC5Qb2x5Z29uIHRvIGJlIGFibGUgdG8gbWFudWFsbHkgZGV0ZWN0IGNsaWNrcyBvbiBDYW52YXMtcmVuZGVyZWQgcG9seWdvbnMuXHJcbiAqL1xyXG5cclxuTC5Qb2x5Z29uLmluY2x1ZGUoIUwuUGF0aC5DQU5WQVMgPyB7fSA6IHtcclxuXHRfY29udGFpbnNQb2ludDogZnVuY3Rpb24gKHApIHtcclxuXHRcdHZhciBpbnNpZGUgPSBmYWxzZSxcclxuXHRcdCAgICBwYXJ0LCBwMSwgcDIsXHJcblx0XHQgICAgaSwgaiwgayxcclxuXHRcdCAgICBsZW4sIGxlbjI7XHJcblxyXG5cdFx0Ly8gVE9ETyBvcHRpbWl6YXRpb246IGNoZWNrIGlmIHdpdGhpbiBib3VuZHMgZmlyc3RcclxuXHJcblx0XHRpZiAoTC5Qb2x5bGluZS5wcm90b3R5cGUuX2NvbnRhaW5zUG9pbnQuY2FsbCh0aGlzLCBwLCB0cnVlKSkge1xyXG5cdFx0XHQvLyBjbGljayBvbiBwb2x5Z29uIGJvcmRlclxyXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyByYXkgY2FzdGluZyBhbGdvcml0aG0gZm9yIGRldGVjdGluZyBpZiBwb2ludCBpcyBpbiBwb2x5Z29uXHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gdGhpcy5fcGFydHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0cGFydCA9IHRoaXMuX3BhcnRzW2ldO1xyXG5cclxuXHRcdFx0Zm9yIChqID0gMCwgbGVuMiA9IHBhcnQubGVuZ3RoLCBrID0gbGVuMiAtIDE7IGogPCBsZW4yOyBrID0gaisrKSB7XHJcblx0XHRcdFx0cDEgPSBwYXJ0W2pdO1xyXG5cdFx0XHRcdHAyID0gcGFydFtrXTtcclxuXHJcblx0XHRcdFx0aWYgKCgocDEueSA+IHAueSkgIT09IChwMi55ID4gcC55KSkgJiZcclxuXHRcdFx0XHRcdFx0KHAueCA8IChwMi54IC0gcDEueCkgKiAocC55IC0gcDEueSkgLyAocDIueSAtIHAxLnkpICsgcDEueCkpIHtcclxuXHRcdFx0XHRcdGluc2lkZSA9ICFpbnNpZGU7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIGluc2lkZTtcclxuXHR9XHJcbn0pO1xyXG5cblxuLypcclxuICogRXh0ZW5kcyBMLkNpcmNsZSB3aXRoIENhbnZhcy1zcGVjaWZpYyBjb2RlLlxyXG4gKi9cclxuXHJcbkwuQ2lyY2xlLmluY2x1ZGUoIUwuUGF0aC5DQU5WQVMgPyB7fSA6IHtcclxuXHRfZHJhd1BhdGg6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBwID0gdGhpcy5fcG9pbnQ7XHJcblx0XHR0aGlzLl9jdHguYmVnaW5QYXRoKCk7XHJcblx0XHR0aGlzLl9jdHguYXJjKHAueCwgcC55LCB0aGlzLl9yYWRpdXMsIDAsIE1hdGguUEkgKiAyLCBmYWxzZSk7XHJcblx0fSxcclxuXHJcblx0X2NvbnRhaW5zUG9pbnQ6IGZ1bmN0aW9uIChwKSB7XHJcblx0XHR2YXIgY2VudGVyID0gdGhpcy5fcG9pbnQsXHJcblx0XHQgICAgdzIgPSB0aGlzLm9wdGlvbnMuc3Ryb2tlID8gdGhpcy5vcHRpb25zLndlaWdodCAvIDIgOiAwO1xyXG5cclxuXHRcdHJldHVybiAocC5kaXN0YW5jZVRvKGNlbnRlcikgPD0gdGhpcy5fcmFkaXVzICsgdzIpO1xyXG5cdH1cclxufSk7XHJcblxuXG4vKlxuICogQ2lyY2xlTWFya2VyIGNhbnZhcyBzcGVjaWZpYyBkcmF3aW5nIHBhcnRzLlxuICovXG5cbkwuQ2lyY2xlTWFya2VyLmluY2x1ZGUoIUwuUGF0aC5DQU5WQVMgPyB7fSA6IHtcblx0X3VwZGF0ZVN0eWxlOiBmdW5jdGlvbiAoKSB7XG5cdFx0TC5QYXRoLnByb3RvdHlwZS5fdXBkYXRlU3R5bGUuY2FsbCh0aGlzKTtcblx0fVxufSk7XG5cblxuLypcclxuICogTC5HZW9KU09OIHR1cm5zIGFueSBHZW9KU09OIGRhdGEgaW50byBhIExlYWZsZXQgbGF5ZXIuXHJcbiAqL1xyXG5cclxuTC5HZW9KU09OID0gTC5GZWF0dXJlR3JvdXAuZXh0ZW5kKHtcclxuXHJcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKGdlb2pzb24sIG9wdGlvbnMpIHtcclxuXHRcdEwuc2V0T3B0aW9ucyh0aGlzLCBvcHRpb25zKTtcclxuXHJcblx0XHR0aGlzLl9sYXllcnMgPSB7fTtcclxuXHJcblx0XHRpZiAoZ2VvanNvbikge1xyXG5cdFx0XHR0aGlzLmFkZERhdGEoZ2VvanNvbik7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0YWRkRGF0YTogZnVuY3Rpb24gKGdlb2pzb24pIHtcclxuXHRcdHZhciBmZWF0dXJlcyA9IEwuVXRpbC5pc0FycmF5KGdlb2pzb24pID8gZ2VvanNvbiA6IGdlb2pzb24uZmVhdHVyZXMsXHJcblx0XHQgICAgaSwgbGVuLCBmZWF0dXJlO1xyXG5cclxuXHRcdGlmIChmZWF0dXJlcykge1xyXG5cdFx0XHRmb3IgKGkgPSAwLCBsZW4gPSBmZWF0dXJlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHRcdC8vIE9ubHkgYWRkIHRoaXMgaWYgZ2VvbWV0cnkgb3IgZ2VvbWV0cmllcyBhcmUgc2V0IGFuZCBub3QgbnVsbFxyXG5cdFx0XHRcdGZlYXR1cmUgPSBmZWF0dXJlc1tpXTtcclxuXHRcdFx0XHRpZiAoZmVhdHVyZS5nZW9tZXRyaWVzIHx8IGZlYXR1cmUuZ2VvbWV0cnkgfHwgZmVhdHVyZS5mZWF0dXJlcyB8fCBmZWF0dXJlLmNvb3JkaW5hdGVzKSB7XHJcblx0XHRcdFx0XHR0aGlzLmFkZERhdGEoZmVhdHVyZXNbaV0pO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0XHRyZXR1cm4gdGhpcztcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcclxuXHJcblx0XHRpZiAob3B0aW9ucy5maWx0ZXIgJiYgIW9wdGlvbnMuZmlsdGVyKGdlb2pzb24pKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdHZhciBsYXllciA9IEwuR2VvSlNPTi5nZW9tZXRyeVRvTGF5ZXIoZ2VvanNvbiwgb3B0aW9ucy5wb2ludFRvTGF5ZXIsIG9wdGlvbnMuY29vcmRzVG9MYXRMbmcsIG9wdGlvbnMpO1xyXG5cdFx0bGF5ZXIuZmVhdHVyZSA9IEwuR2VvSlNPTi5hc0ZlYXR1cmUoZ2VvanNvbik7XHJcblxyXG5cdFx0bGF5ZXIuZGVmYXVsdE9wdGlvbnMgPSBsYXllci5vcHRpb25zO1xyXG5cdFx0dGhpcy5yZXNldFN0eWxlKGxheWVyKTtcclxuXHJcblx0XHRpZiAob3B0aW9ucy5vbkVhY2hGZWF0dXJlKSB7XHJcblx0XHRcdG9wdGlvbnMub25FYWNoRmVhdHVyZShnZW9qc29uLCBsYXllcik7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuYWRkTGF5ZXIobGF5ZXIpO1xyXG5cdH0sXHJcblxyXG5cdHJlc2V0U3R5bGU6IGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0dmFyIHN0eWxlID0gdGhpcy5vcHRpb25zLnN0eWxlO1xyXG5cdFx0aWYgKHN0eWxlKSB7XHJcblx0XHRcdC8vIHJlc2V0IGFueSBjdXN0b20gc3R5bGVzXHJcblx0XHRcdEwuVXRpbC5leHRlbmQobGF5ZXIub3B0aW9ucywgbGF5ZXIuZGVmYXVsdE9wdGlvbnMpO1xyXG5cclxuXHRcdFx0dGhpcy5fc2V0TGF5ZXJTdHlsZShsYXllciwgc3R5bGUpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdHNldFN0eWxlOiBmdW5jdGlvbiAoc3R5bGUpIHtcclxuXHRcdHRoaXMuZWFjaExheWVyKGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0XHR0aGlzLl9zZXRMYXllclN0eWxlKGxheWVyLCBzdHlsZSk7XHJcblx0XHR9LCB0aGlzKTtcclxuXHR9LFxyXG5cclxuXHRfc2V0TGF5ZXJTdHlsZTogZnVuY3Rpb24gKGxheWVyLCBzdHlsZSkge1xyXG5cdFx0aWYgKHR5cGVvZiBzdHlsZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG5cdFx0XHRzdHlsZSA9IHN0eWxlKGxheWVyLmZlYXR1cmUpO1xyXG5cdFx0fVxyXG5cdFx0aWYgKGxheWVyLnNldFN0eWxlKSB7XHJcblx0XHRcdGxheWVyLnNldFN0eWxlKHN0eWxlKTtcclxuXHRcdH1cclxuXHR9XHJcbn0pO1xyXG5cclxuTC5leHRlbmQoTC5HZW9KU09OLCB7XHJcblx0Z2VvbWV0cnlUb0xheWVyOiBmdW5jdGlvbiAoZ2VvanNvbiwgcG9pbnRUb0xheWVyLCBjb29yZHNUb0xhdExuZywgdmVjdG9yT3B0aW9ucykge1xyXG5cdFx0dmFyIGdlb21ldHJ5ID0gZ2VvanNvbi50eXBlID09PSAnRmVhdHVyZScgPyBnZW9qc29uLmdlb21ldHJ5IDogZ2VvanNvbixcclxuXHRcdCAgICBjb29yZHMgPSBnZW9tZXRyeS5jb29yZGluYXRlcyxcclxuXHRcdCAgICBsYXllcnMgPSBbXSxcclxuXHRcdCAgICBsYXRsbmcsIGxhdGxuZ3MsIGksIGxlbjtcclxuXHJcblx0XHRjb29yZHNUb0xhdExuZyA9IGNvb3Jkc1RvTGF0TG5nIHx8IHRoaXMuY29vcmRzVG9MYXRMbmc7XHJcblxyXG5cdFx0c3dpdGNoIChnZW9tZXRyeS50eXBlKSB7XHJcblx0XHRjYXNlICdQb2ludCc6XHJcblx0XHRcdGxhdGxuZyA9IGNvb3Jkc1RvTGF0TG5nKGNvb3Jkcyk7XHJcblx0XHRcdHJldHVybiBwb2ludFRvTGF5ZXIgPyBwb2ludFRvTGF5ZXIoZ2VvanNvbiwgbGF0bG5nKSA6IG5ldyBMLk1hcmtlcihsYXRsbmcpO1xyXG5cclxuXHRcdGNhc2UgJ011bHRpUG9pbnQnOlxyXG5cdFx0XHRmb3IgKGkgPSAwLCBsZW4gPSBjb29yZHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0XHRsYXRsbmcgPSBjb29yZHNUb0xhdExuZyhjb29yZHNbaV0pO1xyXG5cdFx0XHRcdGxheWVycy5wdXNoKHBvaW50VG9MYXllciA/IHBvaW50VG9MYXllcihnZW9qc29uLCBsYXRsbmcpIDogbmV3IEwuTWFya2VyKGxhdGxuZykpO1xyXG5cdFx0XHR9XHJcblx0XHRcdHJldHVybiBuZXcgTC5GZWF0dXJlR3JvdXAobGF5ZXJzKTtcclxuXHJcblx0XHRjYXNlICdMaW5lU3RyaW5nJzpcclxuXHRcdFx0bGF0bG5ncyA9IHRoaXMuY29vcmRzVG9MYXRMbmdzKGNvb3JkcywgMCwgY29vcmRzVG9MYXRMbmcpO1xyXG5cdFx0XHRyZXR1cm4gbmV3IEwuUG9seWxpbmUobGF0bG5ncywgdmVjdG9yT3B0aW9ucyk7XHJcblxyXG5cdFx0Y2FzZSAnUG9seWdvbic6XHJcblx0XHRcdGlmIChjb29yZHMubGVuZ3RoID09PSAyICYmICFjb29yZHNbMV0ubGVuZ3RoKSB7XHJcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIEdlb0pTT04gb2JqZWN0LicpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGxhdGxuZ3MgPSB0aGlzLmNvb3Jkc1RvTGF0TG5ncyhjb29yZHMsIDEsIGNvb3Jkc1RvTGF0TG5nKTtcclxuXHRcdFx0cmV0dXJuIG5ldyBMLlBvbHlnb24obGF0bG5ncywgdmVjdG9yT3B0aW9ucyk7XHJcblxyXG5cdFx0Y2FzZSAnTXVsdGlMaW5lU3RyaW5nJzpcclxuXHRcdFx0bGF0bG5ncyA9IHRoaXMuY29vcmRzVG9MYXRMbmdzKGNvb3JkcywgMSwgY29vcmRzVG9MYXRMbmcpO1xyXG5cdFx0XHRyZXR1cm4gbmV3IEwuTXVsdGlQb2x5bGluZShsYXRsbmdzLCB2ZWN0b3JPcHRpb25zKTtcclxuXHJcblx0XHRjYXNlICdNdWx0aVBvbHlnb24nOlxyXG5cdFx0XHRsYXRsbmdzID0gdGhpcy5jb29yZHNUb0xhdExuZ3MoY29vcmRzLCAyLCBjb29yZHNUb0xhdExuZyk7XHJcblx0XHRcdHJldHVybiBuZXcgTC5NdWx0aVBvbHlnb24obGF0bG5ncywgdmVjdG9yT3B0aW9ucyk7XHJcblxyXG5cdFx0Y2FzZSAnR2VvbWV0cnlDb2xsZWN0aW9uJzpcclxuXHRcdFx0Zm9yIChpID0gMCwgbGVuID0gZ2VvbWV0cnkuZ2VvbWV0cmllcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cclxuXHRcdFx0XHRsYXllcnMucHVzaCh0aGlzLmdlb21ldHJ5VG9MYXllcih7XHJcblx0XHRcdFx0XHRnZW9tZXRyeTogZ2VvbWV0cnkuZ2VvbWV0cmllc1tpXSxcclxuXHRcdFx0XHRcdHR5cGU6ICdGZWF0dXJlJyxcclxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IGdlb2pzb24ucHJvcGVydGllc1xyXG5cdFx0XHRcdH0sIHBvaW50VG9MYXllciwgY29vcmRzVG9MYXRMbmcsIHZlY3Rvck9wdGlvbnMpKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRyZXR1cm4gbmV3IEwuRmVhdHVyZUdyb3VwKGxheWVycyk7XHJcblxyXG5cdFx0ZGVmYXVsdDpcclxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIEdlb0pTT04gb2JqZWN0LicpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGNvb3Jkc1RvTGF0TG5nOiBmdW5jdGlvbiAoY29vcmRzKSB7IC8vIChBcnJheVssIEJvb2xlYW5dKSAtPiBMYXRMbmdcclxuXHRcdHJldHVybiBuZXcgTC5MYXRMbmcoY29vcmRzWzFdLCBjb29yZHNbMF0sIGNvb3Jkc1syXSk7XHJcblx0fSxcclxuXHJcblx0Y29vcmRzVG9MYXRMbmdzOiBmdW5jdGlvbiAoY29vcmRzLCBsZXZlbHNEZWVwLCBjb29yZHNUb0xhdExuZykgeyAvLyAoQXJyYXlbLCBOdW1iZXIsIEZ1bmN0aW9uXSkgLT4gQXJyYXlcclxuXHRcdHZhciBsYXRsbmcsIGksIGxlbixcclxuXHRcdCAgICBsYXRsbmdzID0gW107XHJcblxyXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gY29vcmRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcblx0XHRcdGxhdGxuZyA9IGxldmVsc0RlZXAgP1xyXG5cdFx0XHQgICAgICAgIHRoaXMuY29vcmRzVG9MYXRMbmdzKGNvb3Jkc1tpXSwgbGV2ZWxzRGVlcCAtIDEsIGNvb3Jkc1RvTGF0TG5nKSA6XHJcblx0XHRcdCAgICAgICAgKGNvb3Jkc1RvTGF0TG5nIHx8IHRoaXMuY29vcmRzVG9MYXRMbmcpKGNvb3Jkc1tpXSk7XHJcblxyXG5cdFx0XHRsYXRsbmdzLnB1c2gobGF0bG5nKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gbGF0bG5ncztcclxuXHR9LFxyXG5cclxuXHRsYXRMbmdUb0Nvb3JkczogZnVuY3Rpb24gKGxhdGxuZykge1xyXG5cdFx0dmFyIGNvb3JkcyA9IFtsYXRsbmcubG5nLCBsYXRsbmcubGF0XTtcclxuXHJcblx0XHRpZiAobGF0bG5nLmFsdCAhPT0gdW5kZWZpbmVkKSB7XHJcblx0XHRcdGNvb3Jkcy5wdXNoKGxhdGxuZy5hbHQpO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIGNvb3JkcztcclxuXHR9LFxyXG5cclxuXHRsYXRMbmdzVG9Db29yZHM6IGZ1bmN0aW9uIChsYXRMbmdzKSB7XHJcblx0XHR2YXIgY29vcmRzID0gW107XHJcblxyXG5cdFx0Zm9yICh2YXIgaSA9IDAsIGxlbiA9IGxhdExuZ3MubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuXHRcdFx0Y29vcmRzLnB1c2goTC5HZW9KU09OLmxhdExuZ1RvQ29vcmRzKGxhdExuZ3NbaV0pKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gY29vcmRzO1xyXG5cdH0sXHJcblxyXG5cdGdldEZlYXR1cmU6IGZ1bmN0aW9uIChsYXllciwgbmV3R2VvbWV0cnkpIHtcclxuXHRcdHJldHVybiBsYXllci5mZWF0dXJlID8gTC5leHRlbmQoe30sIGxheWVyLmZlYXR1cmUsIHtnZW9tZXRyeTogbmV3R2VvbWV0cnl9KSA6IEwuR2VvSlNPTi5hc0ZlYXR1cmUobmV3R2VvbWV0cnkpO1xyXG5cdH0sXHJcblxyXG5cdGFzRmVhdHVyZTogZnVuY3Rpb24gKGdlb0pTT04pIHtcclxuXHRcdGlmIChnZW9KU09OLnR5cGUgPT09ICdGZWF0dXJlJykge1xyXG5cdFx0XHRyZXR1cm4gZ2VvSlNPTjtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHR0eXBlOiAnRmVhdHVyZScsXHJcblx0XHRcdHByb3BlcnRpZXM6IHt9LFxyXG5cdFx0XHRnZW9tZXRyeTogZ2VvSlNPTlxyXG5cdFx0fTtcclxuXHR9XHJcbn0pO1xyXG5cclxudmFyIFBvaW50VG9HZW9KU09OID0ge1xyXG5cdHRvR2VvSlNPTjogZnVuY3Rpb24gKCkge1xyXG5cdFx0cmV0dXJuIEwuR2VvSlNPTi5nZXRGZWF0dXJlKHRoaXMsIHtcclxuXHRcdFx0dHlwZTogJ1BvaW50JyxcclxuXHRcdFx0Y29vcmRpbmF0ZXM6IEwuR2VvSlNPTi5sYXRMbmdUb0Nvb3Jkcyh0aGlzLmdldExhdExuZygpKVxyXG5cdFx0fSk7XHJcblx0fVxyXG59O1xyXG5cclxuTC5NYXJrZXIuaW5jbHVkZShQb2ludFRvR2VvSlNPTik7XHJcbkwuQ2lyY2xlLmluY2x1ZGUoUG9pbnRUb0dlb0pTT04pO1xyXG5MLkNpcmNsZU1hcmtlci5pbmNsdWRlKFBvaW50VG9HZW9KU09OKTtcclxuXHJcbkwuUG9seWxpbmUuaW5jbHVkZSh7XHJcblx0dG9HZW9KU09OOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gTC5HZW9KU09OLmdldEZlYXR1cmUodGhpcywge1xyXG5cdFx0XHR0eXBlOiAnTGluZVN0cmluZycsXHJcblx0XHRcdGNvb3JkaW5hdGVzOiBMLkdlb0pTT04ubGF0TG5nc1RvQ29vcmRzKHRoaXMuZ2V0TGF0TG5ncygpKVxyXG5cdFx0fSk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwuUG9seWdvbi5pbmNsdWRlKHtcclxuXHR0b0dlb0pTT046IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBjb29yZHMgPSBbTC5HZW9KU09OLmxhdExuZ3NUb0Nvb3Jkcyh0aGlzLmdldExhdExuZ3MoKSldLFxyXG5cdFx0ICAgIGksIGxlbiwgaG9sZTtcclxuXHJcblx0XHRjb29yZHNbMF0ucHVzaChjb29yZHNbMF1bMF0pO1xyXG5cclxuXHRcdGlmICh0aGlzLl9ob2xlcykge1xyXG5cdFx0XHRmb3IgKGkgPSAwLCBsZW4gPSB0aGlzLl9ob2xlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG5cdFx0XHRcdGhvbGUgPSBMLkdlb0pTT04ubGF0TG5nc1RvQ29vcmRzKHRoaXMuX2hvbGVzW2ldKTtcclxuXHRcdFx0XHRob2xlLnB1c2goaG9sZVswXSk7XHJcblx0XHRcdFx0Y29vcmRzLnB1c2goaG9sZSk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gTC5HZW9KU09OLmdldEZlYXR1cmUodGhpcywge1xyXG5cdFx0XHR0eXBlOiAnUG9seWdvbicsXHJcblx0XHRcdGNvb3JkaW5hdGVzOiBjb29yZHNcclxuXHRcdH0pO1xyXG5cdH1cclxufSk7XHJcblxyXG4oZnVuY3Rpb24gKCkge1xyXG5cdGZ1bmN0aW9uIG11bHRpVG9HZW9KU09OKHR5cGUpIHtcclxuXHRcdHJldHVybiBmdW5jdGlvbiAoKSB7XHJcblx0XHRcdHZhciBjb29yZHMgPSBbXTtcclxuXHJcblx0XHRcdHRoaXMuZWFjaExheWVyKGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0XHRcdGNvb3Jkcy5wdXNoKGxheWVyLnRvR2VvSlNPTigpLmdlb21ldHJ5LmNvb3JkaW5hdGVzKTtcclxuXHRcdFx0fSk7XHJcblxyXG5cdFx0XHRyZXR1cm4gTC5HZW9KU09OLmdldEZlYXR1cmUodGhpcywge1xyXG5cdFx0XHRcdHR5cGU6IHR5cGUsXHJcblx0XHRcdFx0Y29vcmRpbmF0ZXM6IGNvb3Jkc1xyXG5cdFx0XHR9KTtcclxuXHRcdH07XHJcblx0fVxyXG5cclxuXHRMLk11bHRpUG9seWxpbmUuaW5jbHVkZSh7dG9HZW9KU09OOiBtdWx0aVRvR2VvSlNPTignTXVsdGlMaW5lU3RyaW5nJyl9KTtcclxuXHRMLk11bHRpUG9seWdvbi5pbmNsdWRlKHt0b0dlb0pTT046IG11bHRpVG9HZW9KU09OKCdNdWx0aVBvbHlnb24nKX0pO1xyXG5cclxuXHRMLkxheWVyR3JvdXAuaW5jbHVkZSh7XHJcblx0XHR0b0dlb0pTT046IGZ1bmN0aW9uICgpIHtcclxuXHJcblx0XHRcdHZhciBnZW9tZXRyeSA9IHRoaXMuZmVhdHVyZSAmJiB0aGlzLmZlYXR1cmUuZ2VvbWV0cnksXHJcblx0XHRcdFx0anNvbnMgPSBbXSxcclxuXHRcdFx0XHRqc29uO1xyXG5cclxuXHRcdFx0aWYgKGdlb21ldHJ5ICYmIGdlb21ldHJ5LnR5cGUgPT09ICdNdWx0aVBvaW50Jykge1xyXG5cdFx0XHRcdHJldHVybiBtdWx0aVRvR2VvSlNPTignTXVsdGlQb2ludCcpLmNhbGwodGhpcyk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHZhciBpc0dlb21ldHJ5Q29sbGVjdGlvbiA9IGdlb21ldHJ5ICYmIGdlb21ldHJ5LnR5cGUgPT09ICdHZW9tZXRyeUNvbGxlY3Rpb24nO1xyXG5cclxuXHRcdFx0dGhpcy5lYWNoTGF5ZXIoZnVuY3Rpb24gKGxheWVyKSB7XHJcblx0XHRcdFx0aWYgKGxheWVyLnRvR2VvSlNPTikge1xyXG5cdFx0XHRcdFx0anNvbiA9IGxheWVyLnRvR2VvSlNPTigpO1xyXG5cdFx0XHRcdFx0anNvbnMucHVzaChpc0dlb21ldHJ5Q29sbGVjdGlvbiA/IGpzb24uZ2VvbWV0cnkgOiBMLkdlb0pTT04uYXNGZWF0dXJlKGpzb24pKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH0pO1xyXG5cclxuXHRcdFx0aWYgKGlzR2VvbWV0cnlDb2xsZWN0aW9uKSB7XHJcblx0XHRcdFx0cmV0dXJuIEwuR2VvSlNPTi5nZXRGZWF0dXJlKHRoaXMsIHtcclxuXHRcdFx0XHRcdGdlb21ldHJpZXM6IGpzb25zLFxyXG5cdFx0XHRcdFx0dHlwZTogJ0dlb21ldHJ5Q29sbGVjdGlvbidcclxuXHRcdFx0XHR9KTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0cmV0dXJuIHtcclxuXHRcdFx0XHR0eXBlOiAnRmVhdHVyZUNvbGxlY3Rpb24nLFxyXG5cdFx0XHRcdGZlYXR1cmVzOiBqc29uc1xyXG5cdFx0XHR9O1xyXG5cdFx0fVxyXG5cdH0pO1xyXG59KCkpO1xyXG5cclxuTC5nZW9Kc29uID0gZnVuY3Rpb24gKGdlb2pzb24sIG9wdGlvbnMpIHtcclxuXHRyZXR1cm4gbmV3IEwuR2VvSlNPTihnZW9qc29uLCBvcHRpb25zKTtcclxufTtcclxuXG5cbi8qXHJcbiAqIEwuRG9tRXZlbnQgY29udGFpbnMgZnVuY3Rpb25zIGZvciB3b3JraW5nIHdpdGggRE9NIGV2ZW50cy5cclxuICovXHJcblxyXG5MLkRvbUV2ZW50ID0ge1xyXG5cdC8qIGluc3BpcmVkIGJ5IEpvaG4gUmVzaWcsIERlYW4gRWR3YXJkcyBhbmQgWVVJIGFkZEV2ZW50IGltcGxlbWVudGF0aW9ucyAqL1xyXG5cdGFkZExpc3RlbmVyOiBmdW5jdGlvbiAob2JqLCB0eXBlLCBmbiwgY29udGV4dCkgeyAvLyAoSFRNTEVsZW1lbnQsIFN0cmluZywgRnVuY3Rpb25bLCBPYmplY3RdKVxyXG5cclxuXHRcdHZhciBpZCA9IEwuc3RhbXAoZm4pLFxyXG5cdFx0ICAgIGtleSA9ICdfbGVhZmxldF8nICsgdHlwZSArIGlkLFxyXG5cdFx0ICAgIGhhbmRsZXIsIG9yaWdpbmFsSGFuZGxlciwgbmV3VHlwZTtcclxuXHJcblx0XHRpZiAob2JqW2tleV0pIHsgcmV0dXJuIHRoaXM7IH1cclxuXHJcblx0XHRoYW5kbGVyID0gZnVuY3Rpb24gKGUpIHtcclxuXHRcdFx0cmV0dXJuIGZuLmNhbGwoY29udGV4dCB8fCBvYmosIGUgfHwgTC5Eb21FdmVudC5fZ2V0RXZlbnQoKSk7XHJcblx0XHR9O1xyXG5cclxuXHRcdGlmIChMLkJyb3dzZXIucG9pbnRlciAmJiB0eXBlLmluZGV4T2YoJ3RvdWNoJykgPT09IDApIHtcclxuXHRcdFx0cmV0dXJuIHRoaXMuYWRkUG9pbnRlckxpc3RlbmVyKG9iaiwgdHlwZSwgaGFuZGxlciwgaWQpO1xyXG5cdFx0fVxyXG5cdFx0aWYgKEwuQnJvd3Nlci50b3VjaCAmJiAodHlwZSA9PT0gJ2RibGNsaWNrJykgJiYgdGhpcy5hZGREb3VibGVUYXBMaXN0ZW5lcikge1xyXG5cdFx0XHR0aGlzLmFkZERvdWJsZVRhcExpc3RlbmVyKG9iaiwgaGFuZGxlciwgaWQpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICgnYWRkRXZlbnRMaXN0ZW5lcicgaW4gb2JqKSB7XHJcblxyXG5cdFx0XHRpZiAodHlwZSA9PT0gJ21vdXNld2hlZWwnKSB7XHJcblx0XHRcdFx0b2JqLmFkZEV2ZW50TGlzdGVuZXIoJ0RPTU1vdXNlU2Nyb2xsJywgaGFuZGxlciwgZmFsc2UpO1xyXG5cdFx0XHRcdG9iai5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGhhbmRsZXIsIGZhbHNlKTtcclxuXHJcblx0XHRcdH0gZWxzZSBpZiAoKHR5cGUgPT09ICdtb3VzZWVudGVyJykgfHwgKHR5cGUgPT09ICdtb3VzZWxlYXZlJykpIHtcclxuXHJcblx0XHRcdFx0b3JpZ2luYWxIYW5kbGVyID0gaGFuZGxlcjtcclxuXHRcdFx0XHRuZXdUeXBlID0gKHR5cGUgPT09ICdtb3VzZWVudGVyJyA/ICdtb3VzZW92ZXInIDogJ21vdXNlb3V0Jyk7XHJcblxyXG5cdFx0XHRcdGhhbmRsZXIgPSBmdW5jdGlvbiAoZSkge1xyXG5cdFx0XHRcdFx0aWYgKCFMLkRvbUV2ZW50Ll9jaGVja01vdXNlKG9iaiwgZSkpIHsgcmV0dXJuOyB9XHJcblx0XHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxIYW5kbGVyKGUpO1xyXG5cdFx0XHRcdH07XHJcblxyXG5cdFx0XHRcdG9iai5hZGRFdmVudExpc3RlbmVyKG5ld1R5cGUsIGhhbmRsZXIsIGZhbHNlKTtcclxuXHJcblx0XHRcdH0gZWxzZSBpZiAodHlwZSA9PT0gJ2NsaWNrJyAmJiBMLkJyb3dzZXIuYW5kcm9pZCkge1xyXG5cdFx0XHRcdG9yaWdpbmFsSGFuZGxlciA9IGhhbmRsZXI7XHJcblx0XHRcdFx0aGFuZGxlciA9IGZ1bmN0aW9uIChlKSB7XHJcblx0XHRcdFx0XHRyZXR1cm4gTC5Eb21FdmVudC5fZmlsdGVyQ2xpY2soZSwgb3JpZ2luYWxIYW5kbGVyKTtcclxuXHRcdFx0XHR9O1xyXG5cclxuXHRcdFx0XHRvYmouYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBoYW5kbGVyLCBmYWxzZSk7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0b2JqLmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgaGFuZGxlciwgZmFsc2UpO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0fSBlbHNlIGlmICgnYXR0YWNoRXZlbnQnIGluIG9iaikge1xyXG5cdFx0XHRvYmouYXR0YWNoRXZlbnQoJ29uJyArIHR5cGUsIGhhbmRsZXIpO1xyXG5cdFx0fVxyXG5cclxuXHRcdG9ialtrZXldID0gaGFuZGxlcjtcclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRyZW1vdmVMaXN0ZW5lcjogZnVuY3Rpb24gKG9iaiwgdHlwZSwgZm4pIHsgIC8vIChIVE1MRWxlbWVudCwgU3RyaW5nLCBGdW5jdGlvbilcclxuXHJcblx0XHR2YXIgaWQgPSBMLnN0YW1wKGZuKSxcclxuXHRcdCAgICBrZXkgPSAnX2xlYWZsZXRfJyArIHR5cGUgKyBpZCxcclxuXHRcdCAgICBoYW5kbGVyID0gb2JqW2tleV07XHJcblxyXG5cdFx0aWYgKCFoYW5kbGVyKSB7IHJldHVybiB0aGlzOyB9XHJcblxyXG5cdFx0aWYgKEwuQnJvd3Nlci5wb2ludGVyICYmIHR5cGUuaW5kZXhPZigndG91Y2gnKSA9PT0gMCkge1xyXG5cdFx0XHR0aGlzLnJlbW92ZVBvaW50ZXJMaXN0ZW5lcihvYmosIHR5cGUsIGlkKTtcclxuXHRcdH0gZWxzZSBpZiAoTC5Ccm93c2VyLnRvdWNoICYmICh0eXBlID09PSAnZGJsY2xpY2snKSAmJiB0aGlzLnJlbW92ZURvdWJsZVRhcExpc3RlbmVyKSB7XHJcblx0XHRcdHRoaXMucmVtb3ZlRG91YmxlVGFwTGlzdGVuZXIob2JqLCBpZCk7XHJcblxyXG5cdFx0fSBlbHNlIGlmICgncmVtb3ZlRXZlbnRMaXN0ZW5lcicgaW4gb2JqKSB7XHJcblxyXG5cdFx0XHRpZiAodHlwZSA9PT0gJ21vdXNld2hlZWwnKSB7XHJcblx0XHRcdFx0b2JqLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ0RPTU1vdXNlU2Nyb2xsJywgaGFuZGxlciwgZmFsc2UpO1xyXG5cdFx0XHRcdG9iai5yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGhhbmRsZXIsIGZhbHNlKTtcclxuXHJcblx0XHRcdH0gZWxzZSBpZiAoKHR5cGUgPT09ICdtb3VzZWVudGVyJykgfHwgKHR5cGUgPT09ICdtb3VzZWxlYXZlJykpIHtcclxuXHRcdFx0XHRvYmoucmVtb3ZlRXZlbnRMaXN0ZW5lcigodHlwZSA9PT0gJ21vdXNlZW50ZXInID8gJ21vdXNlb3ZlcicgOiAnbW91c2VvdXQnKSwgaGFuZGxlciwgZmFsc2UpO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdG9iai5yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGhhbmRsZXIsIGZhbHNlKTtcclxuXHRcdFx0fVxyXG5cdFx0fSBlbHNlIGlmICgnZGV0YWNoRXZlbnQnIGluIG9iaikge1xyXG5cdFx0XHRvYmouZGV0YWNoRXZlbnQoJ29uJyArIHR5cGUsIGhhbmRsZXIpO1xyXG5cdFx0fVxyXG5cclxuXHRcdG9ialtrZXldID0gbnVsbDtcclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzdG9wUHJvcGFnYXRpb246IGZ1bmN0aW9uIChlKSB7XHJcblxyXG5cdFx0aWYgKGUuc3RvcFByb3BhZ2F0aW9uKSB7XHJcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRlLmNhbmNlbEJ1YmJsZSA9IHRydWU7XHJcblx0XHR9XHJcblx0XHRMLkRvbUV2ZW50Ll9za2lwcGVkKGUpO1xyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdGRpc2FibGVTY3JvbGxQcm9wYWdhdGlvbjogZnVuY3Rpb24gKGVsKSB7XHJcblx0XHR2YXIgc3RvcCA9IEwuRG9tRXZlbnQuc3RvcFByb3BhZ2F0aW9uO1xyXG5cclxuXHRcdHJldHVybiBMLkRvbUV2ZW50XHJcblx0XHRcdC5vbihlbCwgJ21vdXNld2hlZWwnLCBzdG9wKVxyXG5cdFx0XHQub24oZWwsICdNb3pNb3VzZVBpeGVsU2Nyb2xsJywgc3RvcCk7XHJcblx0fSxcclxuXHJcblx0ZGlzYWJsZUNsaWNrUHJvcGFnYXRpb246IGZ1bmN0aW9uIChlbCkge1xyXG5cdFx0dmFyIHN0b3AgPSBMLkRvbUV2ZW50LnN0b3BQcm9wYWdhdGlvbjtcclxuXHJcblx0XHRmb3IgKHZhciBpID0gTC5EcmFnZ2FibGUuU1RBUlQubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuXHRcdFx0TC5Eb21FdmVudC5vbihlbCwgTC5EcmFnZ2FibGUuU1RBUlRbaV0sIHN0b3ApO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiBMLkRvbUV2ZW50XHJcblx0XHRcdC5vbihlbCwgJ2NsaWNrJywgTC5Eb21FdmVudC5fZmFrZVN0b3ApXHJcblx0XHRcdC5vbihlbCwgJ2RibGNsaWNrJywgc3RvcCk7XHJcblx0fSxcclxuXHJcblx0cHJldmVudERlZmF1bHQ6IGZ1bmN0aW9uIChlKSB7XHJcblxyXG5cdFx0aWYgKGUucHJldmVudERlZmF1bHQpIHtcclxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0ZS5yZXR1cm5WYWx1ZSA9IGZhbHNlO1xyXG5cdFx0fVxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0c3RvcDogZnVuY3Rpb24gKGUpIHtcclxuXHRcdHJldHVybiBMLkRvbUV2ZW50XHJcblx0XHRcdC5wcmV2ZW50RGVmYXVsdChlKVxyXG5cdFx0XHQuc3RvcFByb3BhZ2F0aW9uKGUpO1xyXG5cdH0sXHJcblxyXG5cdGdldE1vdXNlUG9zaXRpb246IGZ1bmN0aW9uIChlLCBjb250YWluZXIpIHtcclxuXHRcdGlmICghY29udGFpbmVyKSB7XHJcblx0XHRcdHJldHVybiBuZXcgTC5Qb2ludChlLmNsaWVudFgsIGUuY2xpZW50WSk7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIHJlY3QgPSBjb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBMLlBvaW50KFxyXG5cdFx0XHRlLmNsaWVudFggLSByZWN0LmxlZnQgLSBjb250YWluZXIuY2xpZW50TGVmdCxcclxuXHRcdFx0ZS5jbGllbnRZIC0gcmVjdC50b3AgLSBjb250YWluZXIuY2xpZW50VG9wKTtcclxuXHR9LFxyXG5cclxuXHRnZXRXaGVlbERlbHRhOiBmdW5jdGlvbiAoZSkge1xyXG5cclxuXHRcdHZhciBkZWx0YSA9IDA7XHJcblxyXG5cdFx0aWYgKGUud2hlZWxEZWx0YSkge1xyXG5cdFx0XHRkZWx0YSA9IGUud2hlZWxEZWx0YSAvIDEyMDtcclxuXHRcdH1cclxuXHRcdGlmIChlLmRldGFpbCkge1xyXG5cdFx0XHRkZWx0YSA9IC1lLmRldGFpbCAvIDM7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gZGVsdGE7XHJcblx0fSxcclxuXHJcblx0X3NraXBFdmVudHM6IHt9LFxyXG5cclxuXHRfZmFrZVN0b3A6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHQvLyBmYWtlcyBzdG9wUHJvcGFnYXRpb24gYnkgc2V0dGluZyBhIHNwZWNpYWwgZXZlbnQgZmxhZywgY2hlY2tlZC9yZXNldCB3aXRoIEwuRG9tRXZlbnQuX3NraXBwZWQoZSlcclxuXHRcdEwuRG9tRXZlbnQuX3NraXBFdmVudHNbZS50eXBlXSA9IHRydWU7XHJcblx0fSxcclxuXHJcblx0X3NraXBwZWQ6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHR2YXIgc2tpcHBlZCA9IHRoaXMuX3NraXBFdmVudHNbZS50eXBlXTtcclxuXHRcdC8vIHJlc2V0IHdoZW4gY2hlY2tpbmcsIGFzIGl0J3Mgb25seSB1c2VkIGluIG1hcCBjb250YWluZXIgYW5kIHByb3BhZ2F0ZXMgb3V0c2lkZSBvZiB0aGUgbWFwXHJcblx0XHR0aGlzLl9za2lwRXZlbnRzW2UudHlwZV0gPSBmYWxzZTtcclxuXHRcdHJldHVybiBza2lwcGVkO1xyXG5cdH0sXHJcblxyXG5cdC8vIGNoZWNrIGlmIGVsZW1lbnQgcmVhbGx5IGxlZnQvZW50ZXJlZCB0aGUgZXZlbnQgdGFyZ2V0IChmb3IgbW91c2VlbnRlci9tb3VzZWxlYXZlKVxyXG5cdF9jaGVja01vdXNlOiBmdW5jdGlvbiAoZWwsIGUpIHtcclxuXHJcblx0XHR2YXIgcmVsYXRlZCA9IGUucmVsYXRlZFRhcmdldDtcclxuXHJcblx0XHRpZiAoIXJlbGF0ZWQpIHsgcmV0dXJuIHRydWU7IH1cclxuXHJcblx0XHR0cnkge1xyXG5cdFx0XHR3aGlsZSAocmVsYXRlZCAmJiAocmVsYXRlZCAhPT0gZWwpKSB7XHJcblx0XHRcdFx0cmVsYXRlZCA9IHJlbGF0ZWQucGFyZW50Tm9kZTtcclxuXHRcdFx0fVxyXG5cdFx0fSBjYXRjaCAoZXJyKSB7XHJcblx0XHRcdHJldHVybiBmYWxzZTtcclxuXHRcdH1cclxuXHRcdHJldHVybiAocmVsYXRlZCAhPT0gZWwpO1xyXG5cdH0sXHJcblxyXG5cdF9nZXRFdmVudDogZnVuY3Rpb24gKCkgeyAvLyBldmlsIG1hZ2ljIGZvciBJRVxyXG5cdFx0Lypqc2hpbnQgbm9hcmc6ZmFsc2UgKi9cclxuXHRcdHZhciBlID0gd2luZG93LmV2ZW50O1xyXG5cdFx0aWYgKCFlKSB7XHJcblx0XHRcdHZhciBjYWxsZXIgPSBhcmd1bWVudHMuY2FsbGVlLmNhbGxlcjtcclxuXHRcdFx0d2hpbGUgKGNhbGxlcikge1xyXG5cdFx0XHRcdGUgPSBjYWxsZXJbJ2FyZ3VtZW50cyddWzBdO1xyXG5cdFx0XHRcdGlmIChlICYmIHdpbmRvdy5FdmVudCA9PT0gZS5jb25zdHJ1Y3Rvcikge1xyXG5cdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGNhbGxlciA9IGNhbGxlci5jYWxsZXI7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdHJldHVybiBlO1xyXG5cdH0sXHJcblxyXG5cdC8vIHRoaXMgaXMgYSBob3JyaWJsZSB3b3JrYXJvdW5kIGZvciBhIGJ1ZyBpbiBBbmRyb2lkIHdoZXJlIGEgc2luZ2xlIHRvdWNoIHRyaWdnZXJzIHR3byBjbGljayBldmVudHNcclxuXHRfZmlsdGVyQ2xpY2s6IGZ1bmN0aW9uIChlLCBoYW5kbGVyKSB7XHJcblx0XHR2YXIgdGltZVN0YW1wID0gKGUudGltZVN0YW1wIHx8IGUub3JpZ2luYWxFdmVudC50aW1lU3RhbXApLFxyXG5cdFx0XHRlbGFwc2VkID0gTC5Eb21FdmVudC5fbGFzdENsaWNrICYmICh0aW1lU3RhbXAgLSBMLkRvbUV2ZW50Ll9sYXN0Q2xpY2spO1xyXG5cclxuXHRcdC8vIGFyZSB0aGV5IGNsb3NlciB0b2dldGhlciB0aGFuIDUwMG1zIHlldCBtb3JlIHRoYW4gMTAwbXM/XHJcblx0XHQvLyBBbmRyb2lkIHR5cGljYWxseSB0cmlnZ2VycyB0aGVtIH4zMDBtcyBhcGFydCB3aGlsZSBtdWx0aXBsZSBsaXN0ZW5lcnNcclxuXHRcdC8vIG9uIHRoZSBzYW1lIGV2ZW50IHNob3VsZCBiZSB0cmlnZ2VyZWQgZmFyIGZhc3RlcjtcclxuXHRcdC8vIG9yIGNoZWNrIGlmIGNsaWNrIGlzIHNpbXVsYXRlZCBvbiB0aGUgZWxlbWVudCwgYW5kIGlmIGl0IGlzLCByZWplY3QgYW55IG5vbi1zaW11bGF0ZWQgZXZlbnRzXHJcblxyXG5cdFx0aWYgKChlbGFwc2VkICYmIGVsYXBzZWQgPiAxMDAgJiYgZWxhcHNlZCA8IDUwMCkgfHwgKGUudGFyZ2V0Ll9zaW11bGF0ZWRDbGljayAmJiAhZS5fc2ltdWxhdGVkKSkge1xyXG5cdFx0XHRMLkRvbUV2ZW50LnN0b3AoZSk7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHRcdEwuRG9tRXZlbnQuX2xhc3RDbGljayA9IHRpbWVTdGFtcDtcclxuXHJcblx0XHRyZXR1cm4gaGFuZGxlcihlKTtcclxuXHR9XHJcbn07XHJcblxyXG5MLkRvbUV2ZW50Lm9uID0gTC5Eb21FdmVudC5hZGRMaXN0ZW5lcjtcclxuTC5Eb21FdmVudC5vZmYgPSBMLkRvbUV2ZW50LnJlbW92ZUxpc3RlbmVyO1xyXG5cblxuLypcclxuICogTC5EcmFnZ2FibGUgYWxsb3dzIHlvdSB0byBhZGQgZHJhZ2dpbmcgY2FwYWJpbGl0aWVzIHRvIGFueSBlbGVtZW50LiBTdXBwb3J0cyBtb2JpbGUgZGV2aWNlcyB0b28uXHJcbiAqL1xyXG5cclxuTC5EcmFnZ2FibGUgPSBMLkNsYXNzLmV4dGVuZCh7XHJcblx0aW5jbHVkZXM6IEwuTWl4aW4uRXZlbnRzLFxyXG5cclxuXHRzdGF0aWNzOiB7XHJcblx0XHRTVEFSVDogTC5Ccm93c2VyLnRvdWNoID8gWyd0b3VjaHN0YXJ0JywgJ21vdXNlZG93biddIDogWydtb3VzZWRvd24nXSxcclxuXHRcdEVORDoge1xyXG5cdFx0XHRtb3VzZWRvd246ICdtb3VzZXVwJyxcclxuXHRcdFx0dG91Y2hzdGFydDogJ3RvdWNoZW5kJyxcclxuXHRcdFx0cG9pbnRlcmRvd246ICd0b3VjaGVuZCcsXHJcblx0XHRcdE1TUG9pbnRlckRvd246ICd0b3VjaGVuZCdcclxuXHRcdH0sXHJcblx0XHRNT1ZFOiB7XHJcblx0XHRcdG1vdXNlZG93bjogJ21vdXNlbW92ZScsXHJcblx0XHRcdHRvdWNoc3RhcnQ6ICd0b3VjaG1vdmUnLFxyXG5cdFx0XHRwb2ludGVyZG93bjogJ3RvdWNobW92ZScsXHJcblx0XHRcdE1TUG9pbnRlckRvd246ICd0b3VjaG1vdmUnXHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKGVsZW1lbnQsIGRyYWdTdGFydFRhcmdldCkge1xyXG5cdFx0dGhpcy5fZWxlbWVudCA9IGVsZW1lbnQ7XHJcblx0XHR0aGlzLl9kcmFnU3RhcnRUYXJnZXQgPSBkcmFnU3RhcnRUYXJnZXQgfHwgZWxlbWVudDtcclxuXHR9LFxyXG5cclxuXHRlbmFibGU6IGZ1bmN0aW9uICgpIHtcclxuXHRcdGlmICh0aGlzLl9lbmFibGVkKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdGZvciAodmFyIGkgPSBMLkRyYWdnYWJsZS5TVEFSVC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG5cdFx0XHRMLkRvbUV2ZW50Lm9uKHRoaXMuX2RyYWdTdGFydFRhcmdldCwgTC5EcmFnZ2FibGUuU1RBUlRbaV0sIHRoaXMuX29uRG93biwgdGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fZW5hYmxlZCA9IHRydWU7XHJcblx0fSxcclxuXHJcblx0ZGlzYWJsZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9lbmFibGVkKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdGZvciAodmFyIGkgPSBMLkRyYWdnYWJsZS5TVEFSVC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG5cdFx0XHRMLkRvbUV2ZW50Lm9mZih0aGlzLl9kcmFnU3RhcnRUYXJnZXQsIEwuRHJhZ2dhYmxlLlNUQVJUW2ldLCB0aGlzLl9vbkRvd24sIHRoaXMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2VuYWJsZWQgPSBmYWxzZTtcclxuXHRcdHRoaXMuX21vdmVkID0gZmFsc2U7XHJcblx0fSxcclxuXHJcblx0X29uRG93bjogZnVuY3Rpb24gKGUpIHtcclxuXHRcdHRoaXMuX21vdmVkID0gZmFsc2U7XHJcblxyXG5cdFx0aWYgKGUuc2hpZnRLZXkgfHwgKChlLndoaWNoICE9PSAxKSAmJiAoZS5idXR0b24gIT09IDEpICYmICFlLnRvdWNoZXMpKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdEwuRG9tRXZlbnQuc3RvcFByb3BhZ2F0aW9uKGUpO1xyXG5cclxuXHRcdGlmIChMLkRyYWdnYWJsZS5fZGlzYWJsZWQpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0TC5Eb21VdGlsLmRpc2FibGVJbWFnZURyYWcoKTtcclxuXHRcdEwuRG9tVXRpbC5kaXNhYmxlVGV4dFNlbGVjdGlvbigpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9tb3ZpbmcpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dmFyIGZpcnN0ID0gZS50b3VjaGVzID8gZS50b3VjaGVzWzBdIDogZTtcclxuXHJcblx0XHR0aGlzLl9zdGFydFBvaW50ID0gbmV3IEwuUG9pbnQoZmlyc3QuY2xpZW50WCwgZmlyc3QuY2xpZW50WSk7XHJcblx0XHR0aGlzLl9zdGFydFBvcyA9IHRoaXMuX25ld1BvcyA9IEwuRG9tVXRpbC5nZXRQb3NpdGlvbih0aGlzLl9lbGVtZW50KTtcclxuXHJcblx0XHRMLkRvbUV2ZW50XHJcblx0XHQgICAgLm9uKGRvY3VtZW50LCBMLkRyYWdnYWJsZS5NT1ZFW2UudHlwZV0sIHRoaXMuX29uTW92ZSwgdGhpcylcclxuXHRcdCAgICAub24oZG9jdW1lbnQsIEwuRHJhZ2dhYmxlLkVORFtlLnR5cGVdLCB0aGlzLl9vblVwLCB0aGlzKTtcclxuXHR9LFxyXG5cclxuXHRfb25Nb3ZlOiBmdW5jdGlvbiAoZSkge1xyXG5cdFx0aWYgKGUudG91Y2hlcyAmJiBlLnRvdWNoZXMubGVuZ3RoID4gMSkge1xyXG5cdFx0XHR0aGlzLl9tb3ZlZCA9IHRydWU7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgZmlyc3QgPSAoZS50b3VjaGVzICYmIGUudG91Y2hlcy5sZW5ndGggPT09IDEgPyBlLnRvdWNoZXNbMF0gOiBlKSxcclxuXHRcdCAgICBuZXdQb2ludCA9IG5ldyBMLlBvaW50KGZpcnN0LmNsaWVudFgsIGZpcnN0LmNsaWVudFkpLFxyXG5cdFx0ICAgIG9mZnNldCA9IG5ld1BvaW50LnN1YnRyYWN0KHRoaXMuX3N0YXJ0UG9pbnQpO1xyXG5cclxuXHRcdGlmICghb2Zmc2V0LnggJiYgIW9mZnNldC55KSB7IHJldHVybjsgfVxyXG5cdFx0aWYgKEwuQnJvd3Nlci50b3VjaCAmJiBNYXRoLmFicyhvZmZzZXQueCkgKyBNYXRoLmFicyhvZmZzZXQueSkgPCAzKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdEwuRG9tRXZlbnQucHJldmVudERlZmF1bHQoZSk7XHJcblxyXG5cdFx0aWYgKCF0aGlzLl9tb3ZlZCkge1xyXG5cdFx0XHR0aGlzLmZpcmUoJ2RyYWdzdGFydCcpO1xyXG5cclxuXHRcdFx0dGhpcy5fbW92ZWQgPSB0cnVlO1xyXG5cdFx0XHR0aGlzLl9zdGFydFBvcyA9IEwuRG9tVXRpbC5nZXRQb3NpdGlvbih0aGlzLl9lbGVtZW50KS5zdWJ0cmFjdChvZmZzZXQpO1xyXG5cclxuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKGRvY3VtZW50LmJvZHksICdsZWFmbGV0LWRyYWdnaW5nJyk7XHJcblx0XHRcdHRoaXMuX2xhc3RUYXJnZXQgPSBlLnRhcmdldCB8fCBlLnNyY0VsZW1lbnQ7XHJcblx0XHRcdEwuRG9tVXRpbC5hZGRDbGFzcyh0aGlzLl9sYXN0VGFyZ2V0LCAnbGVhZmxldC1kcmFnLXRhcmdldCcpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX25ld1BvcyA9IHRoaXMuX3N0YXJ0UG9zLmFkZChvZmZzZXQpO1xyXG5cdFx0dGhpcy5fbW92aW5nID0gdHJ1ZTtcclxuXHJcblx0XHRMLlV0aWwuY2FuY2VsQW5pbUZyYW1lKHRoaXMuX2FuaW1SZXF1ZXN0KTtcclxuXHRcdHRoaXMuX2FuaW1SZXF1ZXN0ID0gTC5VdGlsLnJlcXVlc3RBbmltRnJhbWUodGhpcy5fdXBkYXRlUG9zaXRpb24sIHRoaXMsIHRydWUsIHRoaXMuX2RyYWdTdGFydFRhcmdldCk7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZVBvc2l0aW9uOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLmZpcmUoJ3ByZWRyYWcnKTtcclxuXHRcdEwuRG9tVXRpbC5zZXRQb3NpdGlvbih0aGlzLl9lbGVtZW50LCB0aGlzLl9uZXdQb3MpO1xyXG5cdFx0dGhpcy5maXJlKCdkcmFnJyk7XHJcblx0fSxcclxuXHJcblx0X29uVXA6IGZ1bmN0aW9uICgpIHtcclxuXHRcdEwuRG9tVXRpbC5yZW1vdmVDbGFzcyhkb2N1bWVudC5ib2R5LCAnbGVhZmxldC1kcmFnZ2luZycpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9sYXN0VGFyZ2V0KSB7XHJcblx0XHRcdEwuRG9tVXRpbC5yZW1vdmVDbGFzcyh0aGlzLl9sYXN0VGFyZ2V0LCAnbGVhZmxldC1kcmFnLXRhcmdldCcpO1xyXG5cdFx0XHR0aGlzLl9sYXN0VGFyZ2V0ID0gbnVsbDtcclxuXHRcdH1cclxuXHJcblx0XHRmb3IgKHZhciBpIGluIEwuRHJhZ2dhYmxlLk1PVkUpIHtcclxuXHRcdFx0TC5Eb21FdmVudFxyXG5cdFx0XHQgICAgLm9mZihkb2N1bWVudCwgTC5EcmFnZ2FibGUuTU9WRVtpXSwgdGhpcy5fb25Nb3ZlKVxyXG5cdFx0XHQgICAgLm9mZihkb2N1bWVudCwgTC5EcmFnZ2FibGUuRU5EW2ldLCB0aGlzLl9vblVwKTtcclxuXHRcdH1cclxuXHJcblx0XHRMLkRvbVV0aWwuZW5hYmxlSW1hZ2VEcmFnKCk7XHJcblx0XHRMLkRvbVV0aWwuZW5hYmxlVGV4dFNlbGVjdGlvbigpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9tb3ZlZCAmJiB0aGlzLl9tb3ZpbmcpIHtcclxuXHRcdFx0Ly8gZW5zdXJlIGRyYWcgaXMgbm90IGZpcmVkIGFmdGVyIGRyYWdlbmRcclxuXHRcdFx0TC5VdGlsLmNhbmNlbEFuaW1GcmFtZSh0aGlzLl9hbmltUmVxdWVzdCk7XHJcblxyXG5cdFx0XHR0aGlzLmZpcmUoJ2RyYWdlbmQnLCB7XHJcblx0XHRcdFx0ZGlzdGFuY2U6IHRoaXMuX25ld1Bvcy5kaXN0YW5jZVRvKHRoaXMuX3N0YXJ0UG9zKVxyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9tb3ZpbmcgPSBmYWxzZTtcclxuXHR9XHJcbn0pO1xyXG5cblxuLypcblx0TC5IYW5kbGVyIGlzIGEgYmFzZSBjbGFzcyBmb3IgaGFuZGxlciBjbGFzc2VzIHRoYXQgYXJlIHVzZWQgaW50ZXJuYWxseSB0byBpbmplY3Rcblx0aW50ZXJhY3Rpb24gZmVhdHVyZXMgbGlrZSBkcmFnZ2luZyB0byBjbGFzc2VzIGxpa2UgTWFwIGFuZCBNYXJrZXIuXG4qL1xuXG5MLkhhbmRsZXIgPSBMLkNsYXNzLmV4dGVuZCh7XG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChtYXApIHtcblx0XHR0aGlzLl9tYXAgPSBtYXA7XG5cdH0sXG5cblx0ZW5hYmxlOiBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKHRoaXMuX2VuYWJsZWQpIHsgcmV0dXJuOyB9XG5cblx0XHR0aGlzLl9lbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLmFkZEhvb2tzKCk7XG5cdH0sXG5cblx0ZGlzYWJsZTogZnVuY3Rpb24gKCkge1xuXHRcdGlmICghdGhpcy5fZW5hYmxlZCkgeyByZXR1cm47IH1cblxuXHRcdHRoaXMuX2VuYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLnJlbW92ZUhvb2tzKCk7XG5cdH0sXG5cblx0ZW5hYmxlZDogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiAhIXRoaXMuX2VuYWJsZWQ7XG5cdH1cbn0pO1xuXG5cbi8qXG4gKiBMLkhhbmRsZXIuTWFwRHJhZyBpcyB1c2VkIHRvIG1ha2UgdGhlIG1hcCBkcmFnZ2FibGUgKHdpdGggcGFubmluZyBpbmVydGlhKSwgZW5hYmxlZCBieSBkZWZhdWx0LlxuICovXG5cbkwuTWFwLm1lcmdlT3B0aW9ucyh7XG5cdGRyYWdnaW5nOiB0cnVlLFxuXG5cdGluZXJ0aWE6ICFMLkJyb3dzZXIuYW5kcm9pZDIzLFxuXHRpbmVydGlhRGVjZWxlcmF0aW9uOiAzNDAwLCAvLyBweC9zXjJcblx0aW5lcnRpYU1heFNwZWVkOiBJbmZpbml0eSwgLy8gcHgvc1xuXHRpbmVydGlhVGhyZXNob2xkOiBMLkJyb3dzZXIudG91Y2ggPyAzMiA6IDE4LCAvLyBtc1xuXHRlYXNlTGluZWFyaXR5OiAwLjI1LFxuXG5cdC8vIFRPRE8gcmVmYWN0b3IsIG1vdmUgdG8gQ1JTXG5cdHdvcmxkQ29weUp1bXA6IGZhbHNlXG59KTtcblxuTC5NYXAuRHJhZyA9IEwuSGFuZGxlci5leHRlbmQoe1xuXHRhZGRIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdGlmICghdGhpcy5fZHJhZ2dhYmxlKSB7XG5cdFx0XHR2YXIgbWFwID0gdGhpcy5fbWFwO1xuXG5cdFx0XHR0aGlzLl9kcmFnZ2FibGUgPSBuZXcgTC5EcmFnZ2FibGUobWFwLl9tYXBQYW5lLCBtYXAuX2NvbnRhaW5lcik7XG5cblx0XHRcdHRoaXMuX2RyYWdnYWJsZS5vbih7XG5cdFx0XHRcdCdkcmFnc3RhcnQnOiB0aGlzLl9vbkRyYWdTdGFydCxcblx0XHRcdFx0J2RyYWcnOiB0aGlzLl9vbkRyYWcsXG5cdFx0XHRcdCdkcmFnZW5kJzogdGhpcy5fb25EcmFnRW5kXG5cdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0aWYgKG1hcC5vcHRpb25zLndvcmxkQ29weUp1bXApIHtcblx0XHRcdFx0dGhpcy5fZHJhZ2dhYmxlLm9uKCdwcmVkcmFnJywgdGhpcy5fb25QcmVEcmFnLCB0aGlzKTtcblx0XHRcdFx0bWFwLm9uKCd2aWV3cmVzZXQnLCB0aGlzLl9vblZpZXdSZXNldCwgdGhpcyk7XG5cblx0XHRcdFx0bWFwLndoZW5SZWFkeSh0aGlzLl9vblZpZXdSZXNldCwgdGhpcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2RyYWdnYWJsZS5lbmFibGUoKTtcblx0fSxcblxuXHRyZW1vdmVIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMuX2RyYWdnYWJsZS5kaXNhYmxlKCk7XG5cdH0sXG5cblx0bW92ZWQ6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZHJhZ2dhYmxlICYmIHRoaXMuX2RyYWdnYWJsZS5fbW92ZWQ7XG5cdH0sXG5cblx0X29uRHJhZ1N0YXJ0OiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIG1hcCA9IHRoaXMuX21hcDtcblxuXHRcdGlmIChtYXAuX3BhbkFuaW0pIHtcblx0XHRcdG1hcC5fcGFuQW5pbS5zdG9wKCk7XG5cdFx0fVxuXG5cdFx0bWFwXG5cdFx0ICAgIC5maXJlKCdtb3Zlc3RhcnQnKVxuXHRcdCAgICAuZmlyZSgnZHJhZ3N0YXJ0Jyk7XG5cblx0XHRpZiAobWFwLm9wdGlvbnMuaW5lcnRpYSkge1xuXHRcdFx0dGhpcy5fcG9zaXRpb25zID0gW107XG5cdFx0XHR0aGlzLl90aW1lcyA9IFtdO1xuXHRcdH1cblx0fSxcblxuXHRfb25EcmFnOiBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKHRoaXMuX21hcC5vcHRpb25zLmluZXJ0aWEpIHtcblx0XHRcdHZhciB0aW1lID0gdGhpcy5fbGFzdFRpbWUgPSArbmV3IERhdGUoKSxcblx0XHRcdCAgICBwb3MgPSB0aGlzLl9sYXN0UG9zID0gdGhpcy5fZHJhZ2dhYmxlLl9uZXdQb3M7XG5cblx0XHRcdHRoaXMuX3Bvc2l0aW9ucy5wdXNoKHBvcyk7XG5cdFx0XHR0aGlzLl90aW1lcy5wdXNoKHRpbWUpO1xuXG5cdFx0XHRpZiAodGltZSAtIHRoaXMuX3RpbWVzWzBdID4gMjAwKSB7XG5cdFx0XHRcdHRoaXMuX3Bvc2l0aW9ucy5zaGlmdCgpO1xuXHRcdFx0XHR0aGlzLl90aW1lcy5zaGlmdCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX21hcFxuXHRcdCAgICAuZmlyZSgnbW92ZScpXG5cdFx0ICAgIC5maXJlKCdkcmFnJyk7XG5cdH0sXG5cblx0X29uVmlld1Jlc2V0OiBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gVE9ETyBmaXggaGFyZGNvZGVkIEVhcnRoIHZhbHVlc1xuXHRcdHZhciBweENlbnRlciA9IHRoaXMuX21hcC5nZXRTaXplKCkuX2RpdmlkZUJ5KDIpLFxuXHRcdCAgICBweFdvcmxkQ2VudGVyID0gdGhpcy5fbWFwLmxhdExuZ1RvTGF5ZXJQb2ludChbMCwgMF0pO1xuXG5cdFx0dGhpcy5faW5pdGlhbFdvcmxkT2Zmc2V0ID0gcHhXb3JsZENlbnRlci5zdWJ0cmFjdChweENlbnRlcikueDtcblx0XHR0aGlzLl93b3JsZFdpZHRoID0gdGhpcy5fbWFwLnByb2plY3QoWzAsIDE4MF0pLng7XG5cdH0sXG5cblx0X29uUHJlRHJhZzogZnVuY3Rpb24gKCkge1xuXHRcdC8vIFRPRE8gcmVmYWN0b3IgdG8gYmUgYWJsZSB0byBhZGp1c3QgbWFwIHBhbmUgcG9zaXRpb24gYWZ0ZXIgem9vbVxuXHRcdHZhciB3b3JsZFdpZHRoID0gdGhpcy5fd29ybGRXaWR0aCxcblx0XHQgICAgaGFsZldpZHRoID0gTWF0aC5yb3VuZCh3b3JsZFdpZHRoIC8gMiksXG5cdFx0ICAgIGR4ID0gdGhpcy5faW5pdGlhbFdvcmxkT2Zmc2V0LFxuXHRcdCAgICB4ID0gdGhpcy5fZHJhZ2dhYmxlLl9uZXdQb3MueCxcblx0XHQgICAgbmV3WDEgPSAoeCAtIGhhbGZXaWR0aCArIGR4KSAlIHdvcmxkV2lkdGggKyBoYWxmV2lkdGggLSBkeCxcblx0XHQgICAgbmV3WDIgPSAoeCArIGhhbGZXaWR0aCArIGR4KSAlIHdvcmxkV2lkdGggLSBoYWxmV2lkdGggLSBkeCxcblx0XHQgICAgbmV3WCA9IE1hdGguYWJzKG5ld1gxICsgZHgpIDwgTWF0aC5hYnMobmV3WDIgKyBkeCkgPyBuZXdYMSA6IG5ld1gyO1xuXG5cdFx0dGhpcy5fZHJhZ2dhYmxlLl9uZXdQb3MueCA9IG5ld1g7XG5cdH0sXG5cblx0X29uRHJhZ0VuZDogZnVuY3Rpb24gKGUpIHtcblx0XHR2YXIgbWFwID0gdGhpcy5fbWFwLFxuXHRcdCAgICBvcHRpb25zID0gbWFwLm9wdGlvbnMsXG5cdFx0ICAgIGRlbGF5ID0gK25ldyBEYXRlKCkgLSB0aGlzLl9sYXN0VGltZSxcblxuXHRcdCAgICBub0luZXJ0aWEgPSAhb3B0aW9ucy5pbmVydGlhIHx8IGRlbGF5ID4gb3B0aW9ucy5pbmVydGlhVGhyZXNob2xkIHx8ICF0aGlzLl9wb3NpdGlvbnNbMF07XG5cblx0XHRtYXAuZmlyZSgnZHJhZ2VuZCcsIGUpO1xuXG5cdFx0aWYgKG5vSW5lcnRpYSkge1xuXHRcdFx0bWFwLmZpcmUoJ21vdmVlbmQnKTtcblxuXHRcdH0gZWxzZSB7XG5cblx0XHRcdHZhciBkaXJlY3Rpb24gPSB0aGlzLl9sYXN0UG9zLnN1YnRyYWN0KHRoaXMuX3Bvc2l0aW9uc1swXSksXG5cdFx0XHQgICAgZHVyYXRpb24gPSAodGhpcy5fbGFzdFRpbWUgKyBkZWxheSAtIHRoaXMuX3RpbWVzWzBdKSAvIDEwMDAsXG5cdFx0XHQgICAgZWFzZSA9IG9wdGlvbnMuZWFzZUxpbmVhcml0eSxcblxuXHRcdFx0ICAgIHNwZWVkVmVjdG9yID0gZGlyZWN0aW9uLm11bHRpcGx5QnkoZWFzZSAvIGR1cmF0aW9uKSxcblx0XHRcdCAgICBzcGVlZCA9IHNwZWVkVmVjdG9yLmRpc3RhbmNlVG8oWzAsIDBdKSxcblxuXHRcdFx0ICAgIGxpbWl0ZWRTcGVlZCA9IE1hdGgubWluKG9wdGlvbnMuaW5lcnRpYU1heFNwZWVkLCBzcGVlZCksXG5cdFx0XHQgICAgbGltaXRlZFNwZWVkVmVjdG9yID0gc3BlZWRWZWN0b3IubXVsdGlwbHlCeShsaW1pdGVkU3BlZWQgLyBzcGVlZCksXG5cblx0XHRcdCAgICBkZWNlbGVyYXRpb25EdXJhdGlvbiA9IGxpbWl0ZWRTcGVlZCAvIChvcHRpb25zLmluZXJ0aWFEZWNlbGVyYXRpb24gKiBlYXNlKSxcblx0XHRcdCAgICBvZmZzZXQgPSBsaW1pdGVkU3BlZWRWZWN0b3IubXVsdGlwbHlCeSgtZGVjZWxlcmF0aW9uRHVyYXRpb24gLyAyKS5yb3VuZCgpO1xuXG5cdFx0XHRpZiAoIW9mZnNldC54IHx8ICFvZmZzZXQueSkge1xuXHRcdFx0XHRtYXAuZmlyZSgnbW92ZWVuZCcpO1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvZmZzZXQgPSBtYXAuX2xpbWl0T2Zmc2V0KG9mZnNldCwgbWFwLm9wdGlvbnMubWF4Qm91bmRzKTtcblxuXHRcdFx0XHRMLlV0aWwucmVxdWVzdEFuaW1GcmFtZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdFx0bWFwLnBhbkJ5KG9mZnNldCwge1xuXHRcdFx0XHRcdFx0ZHVyYXRpb246IGRlY2VsZXJhdGlvbkR1cmF0aW9uLFxuXHRcdFx0XHRcdFx0ZWFzZUxpbmVhcml0eTogZWFzZSxcblx0XHRcdFx0XHRcdG5vTW92ZVN0YXJ0OiB0cnVlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbkwuTWFwLmFkZEluaXRIb29rKCdhZGRIYW5kbGVyJywgJ2RyYWdnaW5nJywgTC5NYXAuRHJhZyk7XG5cblxuLypcbiAqIEwuSGFuZGxlci5Eb3VibGVDbGlja1pvb20gaXMgdXNlZCB0byBoYW5kbGUgZG91YmxlLWNsaWNrIHpvb20gb24gdGhlIG1hcCwgZW5hYmxlZCBieSBkZWZhdWx0LlxuICovXG5cbkwuTWFwLm1lcmdlT3B0aW9ucyh7XG5cdGRvdWJsZUNsaWNrWm9vbTogdHJ1ZVxufSk7XG5cbkwuTWFwLkRvdWJsZUNsaWNrWm9vbSA9IEwuSGFuZGxlci5leHRlbmQoe1xuXHRhZGRIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMuX21hcC5vbignZGJsY2xpY2snLCB0aGlzLl9vbkRvdWJsZUNsaWNrLCB0aGlzKTtcblx0fSxcblxuXHRyZW1vdmVIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMuX21hcC5vZmYoJ2RibGNsaWNrJywgdGhpcy5fb25Eb3VibGVDbGljaywgdGhpcyk7XG5cdH0sXG5cblx0X29uRG91YmxlQ2xpY2s6IGZ1bmN0aW9uIChlKSB7XG5cdFx0dmFyIG1hcCA9IHRoaXMuX21hcCxcblx0XHQgICAgem9vbSA9IG1hcC5nZXRab29tKCkgKyAoZS5vcmlnaW5hbEV2ZW50LnNoaWZ0S2V5ID8gLTEgOiAxKTtcblxuXHRcdGlmIChtYXAub3B0aW9ucy5kb3VibGVDbGlja1pvb20gPT09ICdjZW50ZXInKSB7XG5cdFx0XHRtYXAuc2V0Wm9vbSh6b29tKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWFwLnNldFpvb21Bcm91bmQoZS5jb250YWluZXJQb2ludCwgem9vbSk7XG5cdFx0fVxuXHR9XG59KTtcblxuTC5NYXAuYWRkSW5pdEhvb2soJ2FkZEhhbmRsZXInLCAnZG91YmxlQ2xpY2tab29tJywgTC5NYXAuRG91YmxlQ2xpY2tab29tKTtcblxuXG4vKlxuICogTC5IYW5kbGVyLlNjcm9sbFdoZWVsWm9vbSBpcyB1c2VkIGJ5IEwuTWFwIHRvIGVuYWJsZSBtb3VzZSBzY3JvbGwgd2hlZWwgem9vbSBvbiB0aGUgbWFwLlxuICovXG5cbkwuTWFwLm1lcmdlT3B0aW9ucyh7XG5cdHNjcm9sbFdoZWVsWm9vbTogdHJ1ZVxufSk7XG5cbkwuTWFwLlNjcm9sbFdoZWVsWm9vbSA9IEwuSGFuZGxlci5leHRlbmQoe1xuXHRhZGRIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdEwuRG9tRXZlbnQub24odGhpcy5fbWFwLl9jb250YWluZXIsICdtb3VzZXdoZWVsJywgdGhpcy5fb25XaGVlbFNjcm9sbCwgdGhpcyk7XG5cdFx0TC5Eb21FdmVudC5vbih0aGlzLl9tYXAuX2NvbnRhaW5lciwgJ01vek1vdXNlUGl4ZWxTY3JvbGwnLCBMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KTtcblx0XHR0aGlzLl9kZWx0YSA9IDA7XG5cdH0sXG5cblx0cmVtb3ZlSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRMLkRvbUV2ZW50Lm9mZih0aGlzLl9tYXAuX2NvbnRhaW5lciwgJ21vdXNld2hlZWwnLCB0aGlzLl9vbldoZWVsU2Nyb2xsKTtcblx0XHRMLkRvbUV2ZW50Lm9mZih0aGlzLl9tYXAuX2NvbnRhaW5lciwgJ01vek1vdXNlUGl4ZWxTY3JvbGwnLCBMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KTtcblx0fSxcblxuXHRfb25XaGVlbFNjcm9sbDogZnVuY3Rpb24gKGUpIHtcblx0XHR2YXIgZGVsdGEgPSBMLkRvbUV2ZW50LmdldFdoZWVsRGVsdGEoZSk7XG5cblx0XHR0aGlzLl9kZWx0YSArPSBkZWx0YTtcblx0XHR0aGlzLl9sYXN0TW91c2VQb3MgPSB0aGlzLl9tYXAubW91c2VFdmVudFRvQ29udGFpbmVyUG9pbnQoZSk7XG5cblx0XHRpZiAoIXRoaXMuX3N0YXJ0VGltZSkge1xuXHRcdFx0dGhpcy5fc3RhcnRUaW1lID0gK25ldyBEYXRlKCk7XG5cdFx0fVxuXG5cdFx0dmFyIGxlZnQgPSBNYXRoLm1heCg0MCAtICgrbmV3IERhdGUoKSAtIHRoaXMuX3N0YXJ0VGltZSksIDApO1xuXG5cdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3RpbWVyKTtcblx0XHR0aGlzLl90aW1lciA9IHNldFRpbWVvdXQoTC5iaW5kKHRoaXMuX3BlcmZvcm1ab29tLCB0aGlzKSwgbGVmdCk7XG5cblx0XHRMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KGUpO1xuXHRcdEwuRG9tRXZlbnQuc3RvcFByb3BhZ2F0aW9uKGUpO1xuXHR9LFxuXG5cdF9wZXJmb3JtWm9vbTogZnVuY3Rpb24gKCkge1xuXHRcdHZhciBtYXAgPSB0aGlzLl9tYXAsXG5cdFx0ICAgIGRlbHRhID0gdGhpcy5fZGVsdGEsXG5cdFx0ICAgIHpvb20gPSBtYXAuZ2V0Wm9vbSgpO1xuXG5cdFx0ZGVsdGEgPSBkZWx0YSA+IDAgPyBNYXRoLmNlaWwoZGVsdGEpIDogTWF0aC5mbG9vcihkZWx0YSk7XG5cdFx0ZGVsdGEgPSBNYXRoLm1heChNYXRoLm1pbihkZWx0YSwgNCksIC00KTtcblx0XHRkZWx0YSA9IG1hcC5fbGltaXRab29tKHpvb20gKyBkZWx0YSkgLSB6b29tO1xuXG5cdFx0dGhpcy5fZGVsdGEgPSAwO1xuXHRcdHRoaXMuX3N0YXJ0VGltZSA9IG51bGw7XG5cblx0XHRpZiAoIWRlbHRhKSB7IHJldHVybjsgfVxuXG5cdFx0aWYgKG1hcC5vcHRpb25zLnNjcm9sbFdoZWVsWm9vbSA9PT0gJ2NlbnRlcicpIHtcblx0XHRcdG1hcC5zZXRab29tKHpvb20gKyBkZWx0YSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1hcC5zZXRab29tQXJvdW5kKHRoaXMuX2xhc3RNb3VzZVBvcywgem9vbSArIGRlbHRhKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5MLk1hcC5hZGRJbml0SG9vaygnYWRkSGFuZGxlcicsICdzY3JvbGxXaGVlbFpvb20nLCBMLk1hcC5TY3JvbGxXaGVlbFpvb20pO1xuXG5cbi8qXHJcbiAqIEV4dGVuZHMgdGhlIGV2ZW50IGhhbmRsaW5nIGNvZGUgd2l0aCBkb3VibGUgdGFwIHN1cHBvcnQgZm9yIG1vYmlsZSBicm93c2Vycy5cclxuICovXHJcblxyXG5MLmV4dGVuZChMLkRvbUV2ZW50LCB7XHJcblxyXG5cdF90b3VjaHN0YXJ0OiBMLkJyb3dzZXIubXNQb2ludGVyID8gJ01TUG9pbnRlckRvd24nIDogTC5Ccm93c2VyLnBvaW50ZXIgPyAncG9pbnRlcmRvd24nIDogJ3RvdWNoc3RhcnQnLFxyXG5cdF90b3VjaGVuZDogTC5Ccm93c2VyLm1zUG9pbnRlciA/ICdNU1BvaW50ZXJVcCcgOiBMLkJyb3dzZXIucG9pbnRlciA/ICdwb2ludGVydXAnIDogJ3RvdWNoZW5kJyxcclxuXHJcblx0Ly8gaW5zcGlyZWQgYnkgWmVwdG8gdG91Y2ggY29kZSBieSBUaG9tYXMgRnVjaHNcclxuXHRhZGREb3VibGVUYXBMaXN0ZW5lcjogZnVuY3Rpb24gKG9iaiwgaGFuZGxlciwgaWQpIHtcclxuXHRcdHZhciBsYXN0LFxyXG5cdFx0ICAgIGRvdWJsZVRhcCA9IGZhbHNlLFxyXG5cdFx0ICAgIGRlbGF5ID0gMjUwLFxyXG5cdFx0ICAgIHRvdWNoLFxyXG5cdFx0ICAgIHByZSA9ICdfbGVhZmxldF8nLFxyXG5cdFx0ICAgIHRvdWNoc3RhcnQgPSB0aGlzLl90b3VjaHN0YXJ0LFxyXG5cdFx0ICAgIHRvdWNoZW5kID0gdGhpcy5fdG91Y2hlbmQsXHJcblx0XHQgICAgdHJhY2tlZFRvdWNoZXMgPSBbXTtcclxuXHJcblx0XHRmdW5jdGlvbiBvblRvdWNoU3RhcnQoZSkge1xyXG5cdFx0XHR2YXIgY291bnQ7XHJcblxyXG5cdFx0XHRpZiAoTC5Ccm93c2VyLnBvaW50ZXIpIHtcclxuXHRcdFx0XHR0cmFja2VkVG91Y2hlcy5wdXNoKGUucG9pbnRlcklkKTtcclxuXHRcdFx0XHRjb3VudCA9IHRyYWNrZWRUb3VjaGVzLmxlbmd0aDtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRjb3VudCA9IGUudG91Y2hlcy5sZW5ndGg7XHJcblx0XHRcdH1cclxuXHRcdFx0aWYgKGNvdW50ID4gMSkge1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0dmFyIG5vdyA9IERhdGUubm93KCksXHJcblx0XHRcdFx0ZGVsdGEgPSBub3cgLSAobGFzdCB8fCBub3cpO1xyXG5cclxuXHRcdFx0dG91Y2ggPSBlLnRvdWNoZXMgPyBlLnRvdWNoZXNbMF0gOiBlO1xyXG5cdFx0XHRkb3VibGVUYXAgPSAoZGVsdGEgPiAwICYmIGRlbHRhIDw9IGRlbGF5KTtcclxuXHRcdFx0bGFzdCA9IG5vdztcclxuXHRcdH1cclxuXHJcblx0XHRmdW5jdGlvbiBvblRvdWNoRW5kKGUpIHtcclxuXHRcdFx0aWYgKEwuQnJvd3Nlci5wb2ludGVyKSB7XHJcblx0XHRcdFx0dmFyIGlkeCA9IHRyYWNrZWRUb3VjaGVzLmluZGV4T2YoZS5wb2ludGVySWQpO1xyXG5cdFx0XHRcdGlmIChpZHggPT09IC0xKSB7XHJcblx0XHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdHRyYWNrZWRUb3VjaGVzLnNwbGljZShpZHgsIDEpO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRpZiAoZG91YmxlVGFwKSB7XHJcblx0XHRcdFx0aWYgKEwuQnJvd3Nlci5wb2ludGVyKSB7XHJcblx0XHRcdFx0XHQvLyB3b3JrIGFyb3VuZCAudHlwZSBiZWluZyByZWFkb25seSB3aXRoIE1TUG9pbnRlciogZXZlbnRzXHJcblx0XHRcdFx0XHR2YXIgbmV3VG91Y2ggPSB7IH0sXHJcblx0XHRcdFx0XHRcdHByb3A7XHJcblxyXG5cdFx0XHRcdFx0Ly8ganNoaW50IGZvcmluOmZhbHNlXHJcblx0XHRcdFx0XHRmb3IgKHZhciBpIGluIHRvdWNoKSB7XHJcblx0XHRcdFx0XHRcdHByb3AgPSB0b3VjaFtpXTtcclxuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBwcm9wID09PSAnZnVuY3Rpb24nKSB7XHJcblx0XHRcdFx0XHRcdFx0bmV3VG91Y2hbaV0gPSBwcm9wLmJpbmQodG91Y2gpO1xyXG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0XHRcdG5ld1RvdWNoW2ldID0gcHJvcDtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0dG91Y2ggPSBuZXdUb3VjaDtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0dG91Y2gudHlwZSA9ICdkYmxjbGljayc7XHJcblx0XHRcdFx0aGFuZGxlcih0b3VjaCk7XHJcblx0XHRcdFx0bGFzdCA9IG51bGw7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdG9ialtwcmUgKyB0b3VjaHN0YXJ0ICsgaWRdID0gb25Ub3VjaFN0YXJ0O1xyXG5cdFx0b2JqW3ByZSArIHRvdWNoZW5kICsgaWRdID0gb25Ub3VjaEVuZDtcclxuXHJcblx0XHQvLyBvbiBwb2ludGVyIHdlIG5lZWQgdG8gbGlzdGVuIG9uIHRoZSBkb2N1bWVudCwgb3RoZXJ3aXNlIGEgZHJhZyBzdGFydGluZyBvbiB0aGUgbWFwIGFuZCBtb3Zpbmcgb2ZmIHNjcmVlblxyXG5cdFx0Ly8gd2lsbCBub3QgY29tZSB0aHJvdWdoIHRvIHVzLCBzbyB3ZSB3aWxsIGxvc2UgdHJhY2sgb2YgaG93IG1hbnkgdG91Y2hlcyBhcmUgb25nb2luZ1xyXG5cdFx0dmFyIGVuZEVsZW1lbnQgPSBMLkJyb3dzZXIucG9pbnRlciA/IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCA6IG9iajtcclxuXHJcblx0XHRvYmouYWRkRXZlbnRMaXN0ZW5lcih0b3VjaHN0YXJ0LCBvblRvdWNoU3RhcnQsIGZhbHNlKTtcclxuXHRcdGVuZEVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcih0b3VjaGVuZCwgb25Ub3VjaEVuZCwgZmFsc2UpO1xyXG5cclxuXHRcdGlmIChMLkJyb3dzZXIucG9pbnRlcikge1xyXG5cdFx0XHRlbmRFbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoTC5Eb21FdmVudC5QT0lOVEVSX0NBTkNFTCwgb25Ub3VjaEVuZCwgZmFsc2UpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdHJlbW92ZURvdWJsZVRhcExpc3RlbmVyOiBmdW5jdGlvbiAob2JqLCBpZCkge1xyXG5cdFx0dmFyIHByZSA9ICdfbGVhZmxldF8nO1xyXG5cclxuXHRcdG9iai5yZW1vdmVFdmVudExpc3RlbmVyKHRoaXMuX3RvdWNoc3RhcnQsIG9ialtwcmUgKyB0aGlzLl90b3VjaHN0YXJ0ICsgaWRdLCBmYWxzZSk7XHJcblx0XHQoTC5Ccm93c2VyLnBvaW50ZXIgPyBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQgOiBvYmopLnJlbW92ZUV2ZW50TGlzdGVuZXIoXHJcblx0XHQgICAgICAgIHRoaXMuX3RvdWNoZW5kLCBvYmpbcHJlICsgdGhpcy5fdG91Y2hlbmQgKyBpZF0sIGZhbHNlKTtcclxuXHJcblx0XHRpZiAoTC5Ccm93c2VyLnBvaW50ZXIpIHtcclxuXHRcdFx0ZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoTC5Eb21FdmVudC5QT0lOVEVSX0NBTkNFTCwgb2JqW3ByZSArIHRoaXMuX3RvdWNoZW5kICsgaWRdLFxyXG5cdFx0XHRcdGZhbHNlKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9XHJcbn0pO1xyXG5cblxuLypcbiAqIEV4dGVuZHMgTC5Eb21FdmVudCB0byBwcm92aWRlIHRvdWNoIHN1cHBvcnQgZm9yIEludGVybmV0IEV4cGxvcmVyIGFuZCBXaW5kb3dzLWJhc2VkIGRldmljZXMuXG4gKi9cblxuTC5leHRlbmQoTC5Eb21FdmVudCwge1xuXG5cdC8vc3RhdGljXG5cdFBPSU5URVJfRE9XTjogTC5Ccm93c2VyLm1zUG9pbnRlciA/ICdNU1BvaW50ZXJEb3duJyA6ICdwb2ludGVyZG93bicsXG5cdFBPSU5URVJfTU9WRTogTC5Ccm93c2VyLm1zUG9pbnRlciA/ICdNU1BvaW50ZXJNb3ZlJyA6ICdwb2ludGVybW92ZScsXG5cdFBPSU5URVJfVVA6IEwuQnJvd3Nlci5tc1BvaW50ZXIgPyAnTVNQb2ludGVyVXAnIDogJ3BvaW50ZXJ1cCcsXG5cdFBPSU5URVJfQ0FOQ0VMOiBMLkJyb3dzZXIubXNQb2ludGVyID8gJ01TUG9pbnRlckNhbmNlbCcgOiAncG9pbnRlcmNhbmNlbCcsXG5cblx0X3BvaW50ZXJzOiBbXSxcblx0X3BvaW50ZXJEb2N1bWVudExpc3RlbmVyOiBmYWxzZSxcblxuXHQvLyBQcm92aWRlcyBhIHRvdWNoIGV2ZW50cyB3cmFwcGVyIGZvciAobXMpcG9pbnRlciBldmVudHMuXG5cdC8vIEJhc2VkIG9uIGNoYW5nZXMgYnkgdmVwcm96YSBodHRwczovL2dpdGh1Yi5jb20vQ2xvdWRNYWRlL0xlYWZsZXQvcHVsbC8xMDE5XG5cdC8vcmVmIGh0dHA6Ly93d3cudzMub3JnL1RSL3BvaW50ZXJldmVudHMvIGh0dHBzOi8vd3d3LnczLm9yZy9CdWdzL1B1YmxpYy9zaG93X2J1Zy5jZ2k/aWQ9MjI4OTBcblxuXHRhZGRQb2ludGVyTGlzdGVuZXI6IGZ1bmN0aW9uIChvYmosIHR5cGUsIGhhbmRsZXIsIGlkKSB7XG5cblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRjYXNlICd0b3VjaHN0YXJ0Jzpcblx0XHRcdHJldHVybiB0aGlzLmFkZFBvaW50ZXJMaXN0ZW5lclN0YXJ0KG9iaiwgdHlwZSwgaGFuZGxlciwgaWQpO1xuXHRcdGNhc2UgJ3RvdWNoZW5kJzpcblx0XHRcdHJldHVybiB0aGlzLmFkZFBvaW50ZXJMaXN0ZW5lckVuZChvYmosIHR5cGUsIGhhbmRsZXIsIGlkKTtcblx0XHRjYXNlICd0b3VjaG1vdmUnOlxuXHRcdFx0cmV0dXJuIHRoaXMuYWRkUG9pbnRlckxpc3RlbmVyTW92ZShvYmosIHR5cGUsIGhhbmRsZXIsIGlkKTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0dGhyb3cgJ1Vua25vd24gdG91Y2ggZXZlbnQgdHlwZSc7XG5cdFx0fVxuXHR9LFxuXG5cdGFkZFBvaW50ZXJMaXN0ZW5lclN0YXJ0OiBmdW5jdGlvbiAob2JqLCB0eXBlLCBoYW5kbGVyLCBpZCkge1xuXHRcdHZhciBwcmUgPSAnX2xlYWZsZXRfJyxcblx0XHQgICAgcG9pbnRlcnMgPSB0aGlzLl9wb2ludGVycztcblxuXHRcdHZhciBjYiA9IGZ1bmN0aW9uIChlKSB7XG5cblx0XHRcdEwuRG9tRXZlbnQucHJldmVudERlZmF1bHQoZSk7XG5cblx0XHRcdHZhciBhbHJlYWR5SW5BcnJheSA9IGZhbHNlO1xuXHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBwb2ludGVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAocG9pbnRlcnNbaV0ucG9pbnRlcklkID09PSBlLnBvaW50ZXJJZCkge1xuXHRcdFx0XHRcdGFscmVhZHlJbkFycmF5ID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFhbHJlYWR5SW5BcnJheSkge1xuXHRcdFx0XHRwb2ludGVycy5wdXNoKGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRlLnRvdWNoZXMgPSBwb2ludGVycy5zbGljZSgpO1xuXHRcdFx0ZS5jaGFuZ2VkVG91Y2hlcyA9IFtlXTtcblxuXHRcdFx0aGFuZGxlcihlKTtcblx0XHR9O1xuXG5cdFx0b2JqW3ByZSArICd0b3VjaHN0YXJ0JyArIGlkXSA9IGNiO1xuXHRcdG9iai5hZGRFdmVudExpc3RlbmVyKHRoaXMuUE9JTlRFUl9ET1dOLCBjYiwgZmFsc2UpO1xuXG5cdFx0Ly8gbmVlZCB0byBhbHNvIGxpc3RlbiBmb3IgZW5kIGV2ZW50cyB0byBrZWVwIHRoZSBfcG9pbnRlcnMgbGlzdCBhY2N1cmF0ZVxuXHRcdC8vIHRoaXMgbmVlZHMgdG8gYmUgb24gdGhlIGJvZHkgYW5kIG5ldmVyIGdvIGF3YXlcblx0XHRpZiAoIXRoaXMuX3BvaW50ZXJEb2N1bWVudExpc3RlbmVyKSB7XG5cdFx0XHR2YXIgaW50ZXJuYWxDYiA9IGZ1bmN0aW9uIChlKSB7XG5cdFx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgcG9pbnRlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRpZiAocG9pbnRlcnNbaV0ucG9pbnRlcklkID09PSBlLnBvaW50ZXJJZCkge1xuXHRcdFx0XHRcdFx0cG9pbnRlcnMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Ly9XZSBsaXN0ZW4gb24gdGhlIGRvY3VtZW50RWxlbWVudCBhcyBhbnkgZHJhZ3MgdGhhdCBlbmQgYnkgbW92aW5nIHRoZSB0b3VjaCBvZmYgdGhlIHNjcmVlbiBnZXQgZmlyZWQgdGhlcmVcblx0XHRcdGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5hZGRFdmVudExpc3RlbmVyKHRoaXMuUE9JTlRFUl9VUCwgaW50ZXJuYWxDYiwgZmFsc2UpO1xuXHRcdFx0ZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIodGhpcy5QT0lOVEVSX0NBTkNFTCwgaW50ZXJuYWxDYiwgZmFsc2UpO1xuXG5cdFx0XHR0aGlzLl9wb2ludGVyRG9jdW1lbnRMaXN0ZW5lciA9IHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0YWRkUG9pbnRlckxpc3RlbmVyTW92ZTogZnVuY3Rpb24gKG9iaiwgdHlwZSwgaGFuZGxlciwgaWQpIHtcblx0XHR2YXIgcHJlID0gJ19sZWFmbGV0XycsXG5cdFx0ICAgIHRvdWNoZXMgPSB0aGlzLl9wb2ludGVycztcblxuXHRcdGZ1bmN0aW9uIGNiKGUpIHtcblxuXHRcdFx0Ly8gZG9uJ3QgZmlyZSB0b3VjaCBtb3ZlcyB3aGVuIG1vdXNlIGlzbid0IGRvd25cblx0XHRcdGlmICgoZS5wb2ludGVyVHlwZSA9PT0gZS5NU1BPSU5URVJfVFlQRV9NT1VTRSB8fCBlLnBvaW50ZXJUeXBlID09PSAnbW91c2UnKSAmJiBlLmJ1dHRvbnMgPT09IDApIHsgcmV0dXJuOyB9XG5cblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgdG91Y2hlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAodG91Y2hlc1tpXS5wb2ludGVySWQgPT09IGUucG9pbnRlcklkKSB7XG5cdFx0XHRcdFx0dG91Y2hlc1tpXSA9IGU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZS50b3VjaGVzID0gdG91Y2hlcy5zbGljZSgpO1xuXHRcdFx0ZS5jaGFuZ2VkVG91Y2hlcyA9IFtlXTtcblxuXHRcdFx0aGFuZGxlcihlKTtcblx0XHR9XG5cblx0XHRvYmpbcHJlICsgJ3RvdWNobW92ZScgKyBpZF0gPSBjYjtcblx0XHRvYmouYWRkRXZlbnRMaXN0ZW5lcih0aGlzLlBPSU5URVJfTU9WRSwgY2IsIGZhbHNlKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGFkZFBvaW50ZXJMaXN0ZW5lckVuZDogZnVuY3Rpb24gKG9iaiwgdHlwZSwgaGFuZGxlciwgaWQpIHtcblx0XHR2YXIgcHJlID0gJ19sZWFmbGV0XycsXG5cdFx0ICAgIHRvdWNoZXMgPSB0aGlzLl9wb2ludGVycztcblxuXHRcdHZhciBjYiA9IGZ1bmN0aW9uIChlKSB7XG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHRvdWNoZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKHRvdWNoZXNbaV0ucG9pbnRlcklkID09PSBlLnBvaW50ZXJJZCkge1xuXHRcdFx0XHRcdHRvdWNoZXMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGUudG91Y2hlcyA9IHRvdWNoZXMuc2xpY2UoKTtcblx0XHRcdGUuY2hhbmdlZFRvdWNoZXMgPSBbZV07XG5cblx0XHRcdGhhbmRsZXIoZSk7XG5cdFx0fTtcblxuXHRcdG9ialtwcmUgKyAndG91Y2hlbmQnICsgaWRdID0gY2I7XG5cdFx0b2JqLmFkZEV2ZW50TGlzdGVuZXIodGhpcy5QT0lOVEVSX1VQLCBjYiwgZmFsc2UpO1xuXHRcdG9iai5hZGRFdmVudExpc3RlbmVyKHRoaXMuUE9JTlRFUl9DQU5DRUwsIGNiLCBmYWxzZSk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVQb2ludGVyTGlzdGVuZXI6IGZ1bmN0aW9uIChvYmosIHR5cGUsIGlkKSB7XG5cdFx0dmFyIHByZSA9ICdfbGVhZmxldF8nLFxuXHRcdCAgICBjYiA9IG9ialtwcmUgKyB0eXBlICsgaWRdO1xuXG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0Y2FzZSAndG91Y2hzdGFydCc6XG5cdFx0XHRvYmoucmVtb3ZlRXZlbnRMaXN0ZW5lcih0aGlzLlBPSU5URVJfRE9XTiwgY2IsIGZhbHNlKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ3RvdWNobW92ZSc6XG5cdFx0XHRvYmoucmVtb3ZlRXZlbnRMaXN0ZW5lcih0aGlzLlBPSU5URVJfTU9WRSwgY2IsIGZhbHNlKTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgJ3RvdWNoZW5kJzpcblx0XHRcdG9iai5yZW1vdmVFdmVudExpc3RlbmVyKHRoaXMuUE9JTlRFUl9VUCwgY2IsIGZhbHNlKTtcblx0XHRcdG9iai5yZW1vdmVFdmVudExpc3RlbmVyKHRoaXMuUE9JTlRFUl9DQU5DRUwsIGNiLCBmYWxzZSk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fVxufSk7XG5cblxuLypcbiAqIEwuSGFuZGxlci5Ub3VjaFpvb20gaXMgdXNlZCBieSBMLk1hcCB0byBhZGQgcGluY2ggem9vbSBvbiBzdXBwb3J0ZWQgbW9iaWxlIGJyb3dzZXJzLlxuICovXG5cbkwuTWFwLm1lcmdlT3B0aW9ucyh7XG5cdHRvdWNoWm9vbTogTC5Ccm93c2VyLnRvdWNoICYmICFMLkJyb3dzZXIuYW5kcm9pZDIzLFxuXHRib3VuY2VBdFpvb21MaW1pdHM6IHRydWVcbn0pO1xuXG5MLk1hcC5Ub3VjaFpvb20gPSBMLkhhbmRsZXIuZXh0ZW5kKHtcblx0YWRkSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRMLkRvbUV2ZW50Lm9uKHRoaXMuX21hcC5fY29udGFpbmVyLCAndG91Y2hzdGFydCcsIHRoaXMuX29uVG91Y2hTdGFydCwgdGhpcyk7XG5cdH0sXG5cblx0cmVtb3ZlSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRMLkRvbUV2ZW50Lm9mZih0aGlzLl9tYXAuX2NvbnRhaW5lciwgJ3RvdWNoc3RhcnQnLCB0aGlzLl9vblRvdWNoU3RhcnQsIHRoaXMpO1xuXHR9LFxuXG5cdF9vblRvdWNoU3RhcnQ6IGZ1bmN0aW9uIChlKSB7XG5cdFx0dmFyIG1hcCA9IHRoaXMuX21hcDtcblxuXHRcdGlmICghZS50b3VjaGVzIHx8IGUudG91Y2hlcy5sZW5ndGggIT09IDIgfHwgbWFwLl9hbmltYXRpbmdab29tIHx8IHRoaXMuX3pvb21pbmcpIHsgcmV0dXJuOyB9XG5cblx0XHR2YXIgcDEgPSBtYXAubW91c2VFdmVudFRvTGF5ZXJQb2ludChlLnRvdWNoZXNbMF0pLFxuXHRcdCAgICBwMiA9IG1hcC5tb3VzZUV2ZW50VG9MYXllclBvaW50KGUudG91Y2hlc1sxXSksXG5cdFx0ICAgIHZpZXdDZW50ZXIgPSBtYXAuX2dldENlbnRlckxheWVyUG9pbnQoKTtcblxuXHRcdHRoaXMuX3N0YXJ0Q2VudGVyID0gcDEuYWRkKHAyKS5fZGl2aWRlQnkoMik7XG5cdFx0dGhpcy5fc3RhcnREaXN0ID0gcDEuZGlzdGFuY2VUbyhwMik7XG5cblx0XHR0aGlzLl9tb3ZlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3pvb21pbmcgPSB0cnVlO1xuXG5cdFx0dGhpcy5fY2VudGVyT2Zmc2V0ID0gdmlld0NlbnRlci5zdWJ0cmFjdCh0aGlzLl9zdGFydENlbnRlcik7XG5cblx0XHRpZiAobWFwLl9wYW5BbmltKSB7XG5cdFx0XHRtYXAuX3BhbkFuaW0uc3RvcCgpO1xuXHRcdH1cblxuXHRcdEwuRG9tRXZlbnRcblx0XHQgICAgLm9uKGRvY3VtZW50LCAndG91Y2htb3ZlJywgdGhpcy5fb25Ub3VjaE1vdmUsIHRoaXMpXG5cdFx0ICAgIC5vbihkb2N1bWVudCwgJ3RvdWNoZW5kJywgdGhpcy5fb25Ub3VjaEVuZCwgdGhpcyk7XG5cblx0XHRMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KGUpO1xuXHR9LFxuXG5cdF9vblRvdWNoTW92ZTogZnVuY3Rpb24gKGUpIHtcblx0XHR2YXIgbWFwID0gdGhpcy5fbWFwO1xuXG5cdFx0aWYgKCFlLnRvdWNoZXMgfHwgZS50b3VjaGVzLmxlbmd0aCAhPT0gMiB8fCAhdGhpcy5fem9vbWluZykgeyByZXR1cm47IH1cblxuXHRcdHZhciBwMSA9IG1hcC5tb3VzZUV2ZW50VG9MYXllclBvaW50KGUudG91Y2hlc1swXSksXG5cdFx0ICAgIHAyID0gbWFwLm1vdXNlRXZlbnRUb0xheWVyUG9pbnQoZS50b3VjaGVzWzFdKTtcblxuXHRcdHRoaXMuX3NjYWxlID0gcDEuZGlzdGFuY2VUbyhwMikgLyB0aGlzLl9zdGFydERpc3Q7XG5cdFx0dGhpcy5fZGVsdGEgPSBwMS5fYWRkKHAyKS5fZGl2aWRlQnkoMikuX3N1YnRyYWN0KHRoaXMuX3N0YXJ0Q2VudGVyKTtcblxuXHRcdGlmICh0aGlzLl9zY2FsZSA9PT0gMSkgeyByZXR1cm47IH1cblxuXHRcdGlmICghbWFwLm9wdGlvbnMuYm91bmNlQXRab29tTGltaXRzKSB7XG5cdFx0XHRpZiAoKG1hcC5nZXRab29tKCkgPT09IG1hcC5nZXRNaW5ab29tKCkgJiYgdGhpcy5fc2NhbGUgPCAxKSB8fFxuXHRcdFx0ICAgIChtYXAuZ2V0Wm9vbSgpID09PSBtYXAuZ2V0TWF4Wm9vbSgpICYmIHRoaXMuX3NjYWxlID4gMSkpIHsgcmV0dXJuOyB9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9tb3ZlZCkge1xuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKG1hcC5fbWFwUGFuZSwgJ2xlYWZsZXQtdG91Y2hpbmcnKTtcblxuXHRcdFx0bWFwXG5cdFx0XHQgICAgLmZpcmUoJ21vdmVzdGFydCcpXG5cdFx0XHQgICAgLmZpcmUoJ3pvb21zdGFydCcpO1xuXG5cdFx0XHR0aGlzLl9tb3ZlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0TC5VdGlsLmNhbmNlbEFuaW1GcmFtZSh0aGlzLl9hbmltUmVxdWVzdCk7XG5cdFx0dGhpcy5fYW5pbVJlcXVlc3QgPSBMLlV0aWwucmVxdWVzdEFuaW1GcmFtZShcblx0XHQgICAgICAgIHRoaXMuX3VwZGF0ZU9uTW92ZSwgdGhpcywgdHJ1ZSwgdGhpcy5fbWFwLl9jb250YWluZXIpO1xuXG5cdFx0TC5Eb21FdmVudC5wcmV2ZW50RGVmYXVsdChlKTtcblx0fSxcblxuXHRfdXBkYXRlT25Nb3ZlOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIG1hcCA9IHRoaXMuX21hcCxcblx0XHQgICAgb3JpZ2luID0gdGhpcy5fZ2V0U2NhbGVPcmlnaW4oKSxcblx0XHQgICAgY2VudGVyID0gbWFwLmxheWVyUG9pbnRUb0xhdExuZyhvcmlnaW4pLFxuXHRcdCAgICB6b29tID0gbWFwLmdldFNjYWxlWm9vbSh0aGlzLl9zY2FsZSk7XG5cblx0XHRtYXAuX2FuaW1hdGVab29tKGNlbnRlciwgem9vbSwgdGhpcy5fc3RhcnRDZW50ZXIsIHRoaXMuX3NjYWxlLCB0aGlzLl9kZWx0YSwgZmFsc2UsIHRydWUpO1xuXHR9LFxuXG5cdF9vblRvdWNoRW5kOiBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCF0aGlzLl9tb3ZlZCB8fCAhdGhpcy5fem9vbWluZykge1xuXHRcdFx0dGhpcy5fem9vbWluZyA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZhciBtYXAgPSB0aGlzLl9tYXA7XG5cblx0XHR0aGlzLl96b29taW5nID0gZmFsc2U7XG5cdFx0TC5Eb21VdGlsLnJlbW92ZUNsYXNzKG1hcC5fbWFwUGFuZSwgJ2xlYWZsZXQtdG91Y2hpbmcnKTtcblx0XHRMLlV0aWwuY2FuY2VsQW5pbUZyYW1lKHRoaXMuX2FuaW1SZXF1ZXN0KTtcblxuXHRcdEwuRG9tRXZlbnRcblx0XHQgICAgLm9mZihkb2N1bWVudCwgJ3RvdWNobW92ZScsIHRoaXMuX29uVG91Y2hNb3ZlKVxuXHRcdCAgICAub2ZmKGRvY3VtZW50LCAndG91Y2hlbmQnLCB0aGlzLl9vblRvdWNoRW5kKTtcblxuXHRcdHZhciBvcmlnaW4gPSB0aGlzLl9nZXRTY2FsZU9yaWdpbigpLFxuXHRcdCAgICBjZW50ZXIgPSBtYXAubGF5ZXJQb2ludFRvTGF0TG5nKG9yaWdpbiksXG5cblx0XHQgICAgb2xkWm9vbSA9IG1hcC5nZXRab29tKCksXG5cdFx0ICAgIGZsb2F0Wm9vbURlbHRhID0gbWFwLmdldFNjYWxlWm9vbSh0aGlzLl9zY2FsZSkgLSBvbGRab29tLFxuXHRcdCAgICByb3VuZFpvb21EZWx0YSA9IChmbG9hdFpvb21EZWx0YSA+IDAgP1xuXHRcdCAgICAgICAgICAgIE1hdGguY2VpbChmbG9hdFpvb21EZWx0YSkgOiBNYXRoLmZsb29yKGZsb2F0Wm9vbURlbHRhKSksXG5cblx0XHQgICAgem9vbSA9IG1hcC5fbGltaXRab29tKG9sZFpvb20gKyByb3VuZFpvb21EZWx0YSksXG5cdFx0ICAgIHNjYWxlID0gbWFwLmdldFpvb21TY2FsZSh6b29tKSAvIHRoaXMuX3NjYWxlO1xuXG5cdFx0bWFwLl9hbmltYXRlWm9vbShjZW50ZXIsIHpvb20sIG9yaWdpbiwgc2NhbGUpO1xuXHR9LFxuXG5cdF9nZXRTY2FsZU9yaWdpbjogZnVuY3Rpb24gKCkge1xuXHRcdHZhciBjZW50ZXJPZmZzZXQgPSB0aGlzLl9jZW50ZXJPZmZzZXQuc3VidHJhY3QodGhpcy5fZGVsdGEpLmRpdmlkZUJ5KHRoaXMuX3NjYWxlKTtcblx0XHRyZXR1cm4gdGhpcy5fc3RhcnRDZW50ZXIuYWRkKGNlbnRlck9mZnNldCk7XG5cdH1cbn0pO1xuXG5MLk1hcC5hZGRJbml0SG9vaygnYWRkSGFuZGxlcicsICd0b3VjaFpvb20nLCBMLk1hcC5Ub3VjaFpvb20pO1xuXG5cbi8qXG4gKiBMLk1hcC5UYXAgaXMgdXNlZCB0byBlbmFibGUgbW9iaWxlIGhhY2tzIGxpa2UgcXVpY2sgdGFwcyBhbmQgbG9uZyBob2xkLlxuICovXG5cbkwuTWFwLm1lcmdlT3B0aW9ucyh7XG5cdHRhcDogdHJ1ZSxcblx0dGFwVG9sZXJhbmNlOiAxNVxufSk7XG5cbkwuTWFwLlRhcCA9IEwuSGFuZGxlci5leHRlbmQoe1xuXHRhZGRIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdEwuRG9tRXZlbnQub24odGhpcy5fbWFwLl9jb250YWluZXIsICd0b3VjaHN0YXJ0JywgdGhpcy5fb25Eb3duLCB0aGlzKTtcblx0fSxcblxuXHRyZW1vdmVIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdEwuRG9tRXZlbnQub2ZmKHRoaXMuX21hcC5fY29udGFpbmVyLCAndG91Y2hzdGFydCcsIHRoaXMuX29uRG93biwgdGhpcyk7XG5cdH0sXG5cblx0X29uRG93bjogZnVuY3Rpb24gKGUpIHtcblx0XHRpZiAoIWUudG91Y2hlcykgeyByZXR1cm47IH1cblxuXHRcdEwuRG9tRXZlbnQucHJldmVudERlZmF1bHQoZSk7XG5cblx0XHR0aGlzLl9maXJlQ2xpY2sgPSB0cnVlO1xuXG5cdFx0Ly8gZG9uJ3Qgc2ltdWxhdGUgY2xpY2sgb3IgdHJhY2sgbG9uZ3ByZXNzIGlmIG1vcmUgdGhhbiAxIHRvdWNoXG5cdFx0aWYgKGUudG91Y2hlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHR0aGlzLl9maXJlQ2xpY2sgPSBmYWxzZTtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9ob2xkVGltZW91dCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dmFyIGZpcnN0ID0gZS50b3VjaGVzWzBdLFxuXHRcdCAgICBlbCA9IGZpcnN0LnRhcmdldDtcblxuXHRcdHRoaXMuX3N0YXJ0UG9zID0gdGhpcy5fbmV3UG9zID0gbmV3IEwuUG9pbnQoZmlyc3QuY2xpZW50WCwgZmlyc3QuY2xpZW50WSk7XG5cblx0XHQvLyBpZiB0b3VjaGluZyBhIGxpbmssIGhpZ2hsaWdodCBpdFxuXHRcdGlmIChlbC50YWdOYW1lICYmIGVsLnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ2EnKSB7XG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3MoZWwsICdsZWFmbGV0LWFjdGl2ZScpO1xuXHRcdH1cblxuXHRcdC8vIHNpbXVsYXRlIGxvbmcgaG9sZCBidXQgc2V0dGluZyBhIHRpbWVvdXRcblx0XHR0aGlzLl9ob2xkVGltZW91dCA9IHNldFRpbWVvdXQoTC5iaW5kKGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmICh0aGlzLl9pc1RhcFZhbGlkKCkpIHtcblx0XHRcdFx0dGhpcy5fZmlyZUNsaWNrID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX29uVXAoKTtcblx0XHRcdFx0dGhpcy5fc2ltdWxhdGVFdmVudCgnY29udGV4dG1lbnUnLCBmaXJzdCk7XG5cdFx0XHR9XG5cdFx0fSwgdGhpcyksIDEwMDApO1xuXG5cdFx0TC5Eb21FdmVudFxuXHRcdFx0Lm9uKGRvY3VtZW50LCAndG91Y2htb3ZlJywgdGhpcy5fb25Nb3ZlLCB0aGlzKVxuXHRcdFx0Lm9uKGRvY3VtZW50LCAndG91Y2hlbmQnLCB0aGlzLl9vblVwLCB0aGlzKTtcblx0fSxcblxuXHRfb25VcDogZnVuY3Rpb24gKGUpIHtcblx0XHRjbGVhclRpbWVvdXQodGhpcy5faG9sZFRpbWVvdXQpO1xuXG5cdFx0TC5Eb21FdmVudFxuXHRcdFx0Lm9mZihkb2N1bWVudCwgJ3RvdWNobW92ZScsIHRoaXMuX29uTW92ZSwgdGhpcylcblx0XHRcdC5vZmYoZG9jdW1lbnQsICd0b3VjaGVuZCcsIHRoaXMuX29uVXAsIHRoaXMpO1xuXG5cdFx0aWYgKHRoaXMuX2ZpcmVDbGljayAmJiBlICYmIGUuY2hhbmdlZFRvdWNoZXMpIHtcblxuXHRcdFx0dmFyIGZpcnN0ID0gZS5jaGFuZ2VkVG91Y2hlc1swXSxcblx0XHRcdCAgICBlbCA9IGZpcnN0LnRhcmdldDtcblxuXHRcdFx0aWYgKGVsICYmIGVsLnRhZ05hbWUgJiYgZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnYScpIHtcblx0XHRcdFx0TC5Eb21VdGlsLnJlbW92ZUNsYXNzKGVsLCAnbGVhZmxldC1hY3RpdmUnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc2ltdWxhdGUgY2xpY2sgaWYgdGhlIHRvdWNoIGRpZG4ndCBtb3ZlIHRvbyBtdWNoXG5cdFx0XHRpZiAodGhpcy5faXNUYXBWYWxpZCgpKSB7XG5cdFx0XHRcdHRoaXMuX3NpbXVsYXRlRXZlbnQoJ2NsaWNrJywgZmlyc3QpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSxcblxuXHRfaXNUYXBWYWxpZDogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0aGlzLl9uZXdQb3MuZGlzdGFuY2VUbyh0aGlzLl9zdGFydFBvcykgPD0gdGhpcy5fbWFwLm9wdGlvbnMudGFwVG9sZXJhbmNlO1xuXHR9LFxuXG5cdF9vbk1vdmU6IGZ1bmN0aW9uIChlKSB7XG5cdFx0dmFyIGZpcnN0ID0gZS50b3VjaGVzWzBdO1xuXHRcdHRoaXMuX25ld1BvcyA9IG5ldyBMLlBvaW50KGZpcnN0LmNsaWVudFgsIGZpcnN0LmNsaWVudFkpO1xuXHR9LFxuXG5cdF9zaW11bGF0ZUV2ZW50OiBmdW5jdGlvbiAodHlwZSwgZSkge1xuXHRcdHZhciBzaW11bGF0ZWRFdmVudCA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdNb3VzZUV2ZW50cycpO1xuXG5cdFx0c2ltdWxhdGVkRXZlbnQuX3NpbXVsYXRlZCA9IHRydWU7XG5cdFx0ZS50YXJnZXQuX3NpbXVsYXRlZENsaWNrID0gdHJ1ZTtcblxuXHRcdHNpbXVsYXRlZEV2ZW50LmluaXRNb3VzZUV2ZW50KFxuXHRcdCAgICAgICAgdHlwZSwgdHJ1ZSwgdHJ1ZSwgd2luZG93LCAxLFxuXHRcdCAgICAgICAgZS5zY3JlZW5YLCBlLnNjcmVlblksXG5cdFx0ICAgICAgICBlLmNsaWVudFgsIGUuY2xpZW50WSxcblx0XHQgICAgICAgIGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCAwLCBudWxsKTtcblxuXHRcdGUudGFyZ2V0LmRpc3BhdGNoRXZlbnQoc2ltdWxhdGVkRXZlbnQpO1xuXHR9XG59KTtcblxuaWYgKEwuQnJvd3Nlci50b3VjaCAmJiAhTC5Ccm93c2VyLnBvaW50ZXIpIHtcblx0TC5NYXAuYWRkSW5pdEhvb2soJ2FkZEhhbmRsZXInLCAndGFwJywgTC5NYXAuVGFwKTtcbn1cblxuXG4vKlxuICogTC5IYW5kbGVyLlNoaWZ0RHJhZ1pvb20gaXMgdXNlZCB0byBhZGQgc2hpZnQtZHJhZyB6b29tIGludGVyYWN0aW9uIHRvIHRoZSBtYXBcbiAgKiAoem9vbSB0byBhIHNlbGVjdGVkIGJvdW5kaW5nIGJveCksIGVuYWJsZWQgYnkgZGVmYXVsdC5cbiAqL1xuXG5MLk1hcC5tZXJnZU9wdGlvbnMoe1xuXHRib3hab29tOiB0cnVlXG59KTtcblxuTC5NYXAuQm94Wm9vbSA9IEwuSGFuZGxlci5leHRlbmQoe1xuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAobWFwKSB7XG5cdFx0dGhpcy5fbWFwID0gbWFwO1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IG1hcC5fY29udGFpbmVyO1xuXHRcdHRoaXMuX3BhbmUgPSBtYXAuX3BhbmVzLm92ZXJsYXlQYW5lO1xuXHRcdHRoaXMuX21vdmVkID0gZmFsc2U7XG5cdH0sXG5cblx0YWRkSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRMLkRvbUV2ZW50Lm9uKHRoaXMuX2NvbnRhaW5lciwgJ21vdXNlZG93bicsIHRoaXMuX29uTW91c2VEb3duLCB0aGlzKTtcblx0fSxcblxuXHRyZW1vdmVIb29rczogZnVuY3Rpb24gKCkge1xuXHRcdEwuRG9tRXZlbnQub2ZmKHRoaXMuX2NvbnRhaW5lciwgJ21vdXNlZG93bicsIHRoaXMuX29uTW91c2VEb3duKTtcblx0XHR0aGlzLl9tb3ZlZCA9IGZhbHNlO1xuXHR9LFxuXG5cdG1vdmVkOiBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vdmVkO1xuXHR9LFxuXG5cdF9vbk1vdXNlRG93bjogZnVuY3Rpb24gKGUpIHtcblx0XHR0aGlzLl9tb3ZlZCA9IGZhbHNlO1xuXG5cdFx0aWYgKCFlLnNoaWZ0S2V5IHx8ICgoZS53aGljaCAhPT0gMSkgJiYgKGUuYnV0dG9uICE9PSAxKSkpIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0XHRMLkRvbVV0aWwuZGlzYWJsZVRleHRTZWxlY3Rpb24oKTtcblx0XHRMLkRvbVV0aWwuZGlzYWJsZUltYWdlRHJhZygpO1xuXG5cdFx0dGhpcy5fc3RhcnRMYXllclBvaW50ID0gdGhpcy5fbWFwLm1vdXNlRXZlbnRUb0xheWVyUG9pbnQoZSk7XG5cblx0XHRMLkRvbUV2ZW50XG5cdFx0ICAgIC5vbihkb2N1bWVudCwgJ21vdXNlbW92ZScsIHRoaXMuX29uTW91c2VNb3ZlLCB0aGlzKVxuXHRcdCAgICAub24oZG9jdW1lbnQsICdtb3VzZXVwJywgdGhpcy5fb25Nb3VzZVVwLCB0aGlzKVxuXHRcdCAgICAub24oZG9jdW1lbnQsICdrZXlkb3duJywgdGhpcy5fb25LZXlEb3duLCB0aGlzKTtcblx0fSxcblxuXHRfb25Nb3VzZU1vdmU6IGZ1bmN0aW9uIChlKSB7XG5cdFx0aWYgKCF0aGlzLl9tb3ZlZCkge1xuXHRcdFx0dGhpcy5fYm94ID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgJ2xlYWZsZXQtem9vbS1ib3gnLCB0aGlzLl9wYW5lKTtcblx0XHRcdEwuRG9tVXRpbC5zZXRQb3NpdGlvbih0aGlzLl9ib3gsIHRoaXMuX3N0YXJ0TGF5ZXJQb2ludCk7XG5cblx0XHRcdC8vVE9ETyByZWZhY3RvcjogbW92ZSBjdXJzb3IgdG8gc3R5bGVzXG5cdFx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUuY3Vyc29yID0gJ2Nyb3NzaGFpcic7XG5cdFx0XHR0aGlzLl9tYXAuZmlyZSgnYm94em9vbXN0YXJ0Jyk7XG5cdFx0fVxuXG5cdFx0dmFyIHN0YXJ0UG9pbnQgPSB0aGlzLl9zdGFydExheWVyUG9pbnQsXG5cdFx0ICAgIGJveCA9IHRoaXMuX2JveCxcblxuXHRcdCAgICBsYXllclBvaW50ID0gdGhpcy5fbWFwLm1vdXNlRXZlbnRUb0xheWVyUG9pbnQoZSksXG5cdFx0ICAgIG9mZnNldCA9IGxheWVyUG9pbnQuc3VidHJhY3Qoc3RhcnRQb2ludCksXG5cblx0XHQgICAgbmV3UG9zID0gbmV3IEwuUG9pbnQoXG5cdFx0ICAgICAgICBNYXRoLm1pbihsYXllclBvaW50LngsIHN0YXJ0UG9pbnQueCksXG5cdFx0ICAgICAgICBNYXRoLm1pbihsYXllclBvaW50LnksIHN0YXJ0UG9pbnQueSkpO1xuXG5cdFx0TC5Eb21VdGlsLnNldFBvc2l0aW9uKGJveCwgbmV3UG9zKTtcblxuXHRcdHRoaXMuX21vdmVkID0gdHJ1ZTtcblxuXHRcdC8vIFRPRE8gcmVmYWN0b3I6IHJlbW92ZSBoYXJkY29kZWQgNCBwaXhlbHNcblx0XHRib3guc3R5bGUud2lkdGggID0gKE1hdGgubWF4KDAsIE1hdGguYWJzKG9mZnNldC54KSAtIDQpKSArICdweCc7XG5cdFx0Ym94LnN0eWxlLmhlaWdodCA9IChNYXRoLm1heCgwLCBNYXRoLmFicyhvZmZzZXQueSkgLSA0KSkgKyAncHgnO1xuXHR9LFxuXG5cdF9maW5pc2g6IGZ1bmN0aW9uICgpIHtcblx0XHRpZiAodGhpcy5fbW92ZWQpIHtcblx0XHRcdHRoaXMuX3BhbmUucmVtb3ZlQ2hpbGQodGhpcy5fYm94KTtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5jdXJzb3IgPSAnJztcblx0XHR9XG5cblx0XHRMLkRvbVV0aWwuZW5hYmxlVGV4dFNlbGVjdGlvbigpO1xuXHRcdEwuRG9tVXRpbC5lbmFibGVJbWFnZURyYWcoKTtcblxuXHRcdEwuRG9tRXZlbnRcblx0XHQgICAgLm9mZihkb2N1bWVudCwgJ21vdXNlbW92ZScsIHRoaXMuX29uTW91c2VNb3ZlKVxuXHRcdCAgICAub2ZmKGRvY3VtZW50LCAnbW91c2V1cCcsIHRoaXMuX29uTW91c2VVcClcblx0XHQgICAgLm9mZihkb2N1bWVudCwgJ2tleWRvd24nLCB0aGlzLl9vbktleURvd24pO1xuXHR9LFxuXG5cdF9vbk1vdXNlVXA6IGZ1bmN0aW9uIChlKSB7XG5cblx0XHR0aGlzLl9maW5pc2goKTtcblxuXHRcdHZhciBtYXAgPSB0aGlzLl9tYXAsXG5cdFx0ICAgIGxheWVyUG9pbnQgPSBtYXAubW91c2VFdmVudFRvTGF5ZXJQb2ludChlKTtcblxuXHRcdGlmICh0aGlzLl9zdGFydExheWVyUG9pbnQuZXF1YWxzKGxheWVyUG9pbnQpKSB7IHJldHVybjsgfVxuXG5cdFx0dmFyIGJvdW5kcyA9IG5ldyBMLkxhdExuZ0JvdW5kcyhcblx0XHQgICAgICAgIG1hcC5sYXllclBvaW50VG9MYXRMbmcodGhpcy5fc3RhcnRMYXllclBvaW50KSxcblx0XHQgICAgICAgIG1hcC5sYXllclBvaW50VG9MYXRMbmcobGF5ZXJQb2ludCkpO1xuXG5cdFx0bWFwLmZpdEJvdW5kcyhib3VuZHMpO1xuXG5cdFx0bWFwLmZpcmUoJ2JveHpvb21lbmQnLCB7XG5cdFx0XHRib3hab29tQm91bmRzOiBib3VuZHNcblx0XHR9KTtcblx0fSxcblxuXHRfb25LZXlEb3duOiBmdW5jdGlvbiAoZSkge1xuXHRcdGlmIChlLmtleUNvZGUgPT09IDI3KSB7XG5cdFx0XHR0aGlzLl9maW5pc2goKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5MLk1hcC5hZGRJbml0SG9vaygnYWRkSGFuZGxlcicsICdib3hab29tJywgTC5NYXAuQm94Wm9vbSk7XG5cblxuLypcbiAqIEwuTWFwLktleWJvYXJkIGlzIGhhbmRsaW5nIGtleWJvYXJkIGludGVyYWN0aW9uIHdpdGggdGhlIG1hcCwgZW5hYmxlZCBieSBkZWZhdWx0LlxuICovXG5cbkwuTWFwLm1lcmdlT3B0aW9ucyh7XG5cdGtleWJvYXJkOiB0cnVlLFxuXHRrZXlib2FyZFBhbk9mZnNldDogODAsXG5cdGtleWJvYXJkWm9vbU9mZnNldDogMVxufSk7XG5cbkwuTWFwLktleWJvYXJkID0gTC5IYW5kbGVyLmV4dGVuZCh7XG5cblx0a2V5Q29kZXM6IHtcblx0XHRsZWZ0OiAgICBbMzddLFxuXHRcdHJpZ2h0OiAgIFszOV0sXG5cdFx0ZG93bjogICAgWzQwXSxcblx0XHR1cDogICAgICBbMzhdLFxuXHRcdHpvb21JbjogIFsxODcsIDEwNywgNjEsIDE3MV0sXG5cdFx0em9vbU91dDogWzE4OSwgMTA5LCAxNzNdXG5cdH0sXG5cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24gKG1hcCkge1xuXHRcdHRoaXMuX21hcCA9IG1hcDtcblxuXHRcdHRoaXMuX3NldFBhbk9mZnNldChtYXAub3B0aW9ucy5rZXlib2FyZFBhbk9mZnNldCk7XG5cdFx0dGhpcy5fc2V0Wm9vbU9mZnNldChtYXAub3B0aW9ucy5rZXlib2FyZFpvb21PZmZzZXQpO1xuXHR9LFxuXG5cdGFkZEhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGNvbnRhaW5lciA9IHRoaXMuX21hcC5fY29udGFpbmVyO1xuXG5cdFx0Ly8gbWFrZSB0aGUgY29udGFpbmVyIGZvY3VzYWJsZSBieSB0YWJiaW5nXG5cdFx0aWYgKGNvbnRhaW5lci50YWJJbmRleCA9PT0gLTEpIHtcblx0XHRcdGNvbnRhaW5lci50YWJJbmRleCA9ICcwJztcblx0XHR9XG5cblx0XHRMLkRvbUV2ZW50XG5cdFx0ICAgIC5vbihjb250YWluZXIsICdmb2N1cycsIHRoaXMuX29uRm9jdXMsIHRoaXMpXG5cdFx0ICAgIC5vbihjb250YWluZXIsICdibHVyJywgdGhpcy5fb25CbHVyLCB0aGlzKVxuXHRcdCAgICAub24oY29udGFpbmVyLCAnbW91c2Vkb3duJywgdGhpcy5fb25Nb3VzZURvd24sIHRoaXMpO1xuXG5cdFx0dGhpcy5fbWFwXG5cdFx0ICAgIC5vbignZm9jdXMnLCB0aGlzLl9hZGRIb29rcywgdGhpcylcblx0XHQgICAgLm9uKCdibHVyJywgdGhpcy5fcmVtb3ZlSG9va3MsIHRoaXMpO1xuXHR9LFxuXG5cdHJlbW92ZUhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy5fcmVtb3ZlSG9va3MoKTtcblxuXHRcdHZhciBjb250YWluZXIgPSB0aGlzLl9tYXAuX2NvbnRhaW5lcjtcblxuXHRcdEwuRG9tRXZlbnRcblx0XHQgICAgLm9mZihjb250YWluZXIsICdmb2N1cycsIHRoaXMuX29uRm9jdXMsIHRoaXMpXG5cdFx0ICAgIC5vZmYoY29udGFpbmVyLCAnYmx1cicsIHRoaXMuX29uQmx1ciwgdGhpcylcblx0XHQgICAgLm9mZihjb250YWluZXIsICdtb3VzZWRvd24nLCB0aGlzLl9vbk1vdXNlRG93biwgdGhpcyk7XG5cblx0XHR0aGlzLl9tYXBcblx0XHQgICAgLm9mZignZm9jdXMnLCB0aGlzLl9hZGRIb29rcywgdGhpcylcblx0XHQgICAgLm9mZignYmx1cicsIHRoaXMuX3JlbW92ZUhvb2tzLCB0aGlzKTtcblx0fSxcblxuXHRfb25Nb3VzZURvd246IGZ1bmN0aW9uICgpIHtcblx0XHRpZiAodGhpcy5fZm9jdXNlZCkgeyByZXR1cm47IH1cblxuXHRcdHZhciBib2R5ID0gZG9jdW1lbnQuYm9keSxcblx0XHQgICAgZG9jRWwgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsXG5cdFx0ICAgIHRvcCA9IGJvZHkuc2Nyb2xsVG9wIHx8IGRvY0VsLnNjcm9sbFRvcCxcblx0XHQgICAgbGVmdCA9IGJvZHkuc2Nyb2xsTGVmdCB8fCBkb2NFbC5zY3JvbGxMZWZ0O1xuXG5cdFx0dGhpcy5fbWFwLl9jb250YWluZXIuZm9jdXMoKTtcblxuXHRcdHdpbmRvdy5zY3JvbGxUbyhsZWZ0LCB0b3ApO1xuXHR9LFxuXG5cdF9vbkZvY3VzOiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy5fZm9jdXNlZCA9IHRydWU7XG5cdFx0dGhpcy5fbWFwLmZpcmUoJ2ZvY3VzJyk7XG5cdH0sXG5cblx0X29uQmx1cjogZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMuX2ZvY3VzZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9tYXAuZmlyZSgnYmx1cicpO1xuXHR9LFxuXG5cdF9zZXRQYW5PZmZzZXQ6IGZ1bmN0aW9uIChwYW4pIHtcblx0XHR2YXIga2V5cyA9IHRoaXMuX3BhbktleXMgPSB7fSxcblx0XHQgICAgY29kZXMgPSB0aGlzLmtleUNvZGVzLFxuXHRcdCAgICBpLCBsZW47XG5cblx0XHRmb3IgKGkgPSAwLCBsZW4gPSBjb2Rlcy5sZWZ0Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRrZXlzW2NvZGVzLmxlZnRbaV1dID0gWy0xICogcGFuLCAwXTtcblx0XHR9XG5cdFx0Zm9yIChpID0gMCwgbGVuID0gY29kZXMucmlnaHQubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGtleXNbY29kZXMucmlnaHRbaV1dID0gW3BhbiwgMF07XG5cdFx0fVxuXHRcdGZvciAoaSA9IDAsIGxlbiA9IGNvZGVzLmRvd24ubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGtleXNbY29kZXMuZG93bltpXV0gPSBbMCwgcGFuXTtcblx0XHR9XG5cdFx0Zm9yIChpID0gMCwgbGVuID0gY29kZXMudXAubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGtleXNbY29kZXMudXBbaV1dID0gWzAsIC0xICogcGFuXTtcblx0XHR9XG5cdH0sXG5cblx0X3NldFpvb21PZmZzZXQ6IGZ1bmN0aW9uICh6b29tKSB7XG5cdFx0dmFyIGtleXMgPSB0aGlzLl96b29tS2V5cyA9IHt9LFxuXHRcdCAgICBjb2RlcyA9IHRoaXMua2V5Q29kZXMsXG5cdFx0ICAgIGksIGxlbjtcblxuXHRcdGZvciAoaSA9IDAsIGxlbiA9IGNvZGVzLnpvb21Jbi5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0a2V5c1tjb2Rlcy56b29tSW5baV1dID0gem9vbTtcblx0XHR9XG5cdFx0Zm9yIChpID0gMCwgbGVuID0gY29kZXMuem9vbU91dC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0a2V5c1tjb2Rlcy56b29tT3V0W2ldXSA9IC16b29tO1xuXHRcdH1cblx0fSxcblxuXHRfYWRkSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHRMLkRvbUV2ZW50Lm9uKGRvY3VtZW50LCAna2V5ZG93bicsIHRoaXMuX29uS2V5RG93biwgdGhpcyk7XG5cdH0sXG5cblx0X3JlbW92ZUhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0TC5Eb21FdmVudC5vZmYoZG9jdW1lbnQsICdrZXlkb3duJywgdGhpcy5fb25LZXlEb3duLCB0aGlzKTtcblx0fSxcblxuXHRfb25LZXlEb3duOiBmdW5jdGlvbiAoZSkge1xuXHRcdHZhciBrZXkgPSBlLmtleUNvZGUsXG5cdFx0ICAgIG1hcCA9IHRoaXMuX21hcDtcblxuXHRcdGlmIChrZXkgaW4gdGhpcy5fcGFuS2V5cykge1xuXG5cdFx0XHRpZiAobWFwLl9wYW5BbmltICYmIG1hcC5fcGFuQW5pbS5faW5Qcm9ncmVzcykgeyByZXR1cm47IH1cblxuXHRcdFx0bWFwLnBhbkJ5KHRoaXMuX3BhbktleXNba2V5XSk7XG5cblx0XHRcdGlmIChtYXAub3B0aW9ucy5tYXhCb3VuZHMpIHtcblx0XHRcdFx0bWFwLnBhbkluc2lkZUJvdW5kcyhtYXAub3B0aW9ucy5tYXhCb3VuZHMpO1xuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIGlmIChrZXkgaW4gdGhpcy5fem9vbUtleXMpIHtcblx0XHRcdG1hcC5zZXRab29tKG1hcC5nZXRab29tKCkgKyB0aGlzLl96b29tS2V5c1trZXldKTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0TC5Eb21FdmVudC5zdG9wKGUpO1xuXHR9XG59KTtcblxuTC5NYXAuYWRkSW5pdEhvb2soJ2FkZEhhbmRsZXInLCAna2V5Ym9hcmQnLCBMLk1hcC5LZXlib2FyZCk7XG5cblxuLypcbiAqIEwuSGFuZGxlci5NYXJrZXJEcmFnIGlzIHVzZWQgaW50ZXJuYWxseSBieSBMLk1hcmtlciB0byBtYWtlIHRoZSBtYXJrZXJzIGRyYWdnYWJsZS5cbiAqL1xuXG5MLkhhbmRsZXIuTWFya2VyRHJhZyA9IEwuSGFuZGxlci5leHRlbmQoe1xuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAobWFya2VyKSB7XG5cdFx0dGhpcy5fbWFya2VyID0gbWFya2VyO1xuXHR9LFxuXG5cdGFkZEhvb2tzOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGljb24gPSB0aGlzLl9tYXJrZXIuX2ljb247XG5cdFx0aWYgKCF0aGlzLl9kcmFnZ2FibGUpIHtcblx0XHRcdHRoaXMuX2RyYWdnYWJsZSA9IG5ldyBMLkRyYWdnYWJsZShpY29uLCBpY29uKTtcblx0XHR9XG5cblx0XHR0aGlzLl9kcmFnZ2FibGVcblx0XHRcdC5vbignZHJhZ3N0YXJ0JywgdGhpcy5fb25EcmFnU3RhcnQsIHRoaXMpXG5cdFx0XHQub24oJ2RyYWcnLCB0aGlzLl9vbkRyYWcsIHRoaXMpXG5cdFx0XHQub24oJ2RyYWdlbmQnLCB0aGlzLl9vbkRyYWdFbmQsIHRoaXMpO1xuXHRcdHRoaXMuX2RyYWdnYWJsZS5lbmFibGUoKTtcblx0XHRMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5fbWFya2VyLl9pY29uLCAnbGVhZmxldC1tYXJrZXItZHJhZ2dhYmxlJyk7XG5cdH0sXG5cblx0cmVtb3ZlSG9va3M6IGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLl9kcmFnZ2FibGVcblx0XHRcdC5vZmYoJ2RyYWdzdGFydCcsIHRoaXMuX29uRHJhZ1N0YXJ0LCB0aGlzKVxuXHRcdFx0Lm9mZignZHJhZycsIHRoaXMuX29uRHJhZywgdGhpcylcblx0XHRcdC5vZmYoJ2RyYWdlbmQnLCB0aGlzLl9vbkRyYWdFbmQsIHRoaXMpO1xuXG5cdFx0dGhpcy5fZHJhZ2dhYmxlLmRpc2FibGUoKTtcblx0XHRMLkRvbVV0aWwucmVtb3ZlQ2xhc3ModGhpcy5fbWFya2VyLl9pY29uLCAnbGVhZmxldC1tYXJrZXItZHJhZ2dhYmxlJyk7XG5cdH0sXG5cblx0bW92ZWQ6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZHJhZ2dhYmxlICYmIHRoaXMuX2RyYWdnYWJsZS5fbW92ZWQ7XG5cdH0sXG5cblx0X29uRHJhZ1N0YXJ0OiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy5fbWFya2VyXG5cdFx0ICAgIC5jbG9zZVBvcHVwKClcblx0XHQgICAgLmZpcmUoJ21vdmVzdGFydCcpXG5cdFx0ICAgIC5maXJlKCdkcmFnc3RhcnQnKTtcblx0fSxcblxuXHRfb25EcmFnOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIG1hcmtlciA9IHRoaXMuX21hcmtlcixcblx0XHQgICAgc2hhZG93ID0gbWFya2VyLl9zaGFkb3csXG5cdFx0ICAgIGljb25Qb3MgPSBMLkRvbVV0aWwuZ2V0UG9zaXRpb24obWFya2VyLl9pY29uKSxcblx0XHQgICAgbGF0bG5nID0gbWFya2VyLl9tYXAubGF5ZXJQb2ludFRvTGF0TG5nKGljb25Qb3MpO1xuXG5cdFx0Ly8gdXBkYXRlIHNoYWRvdyBwb3NpdGlvblxuXHRcdGlmIChzaGFkb3cpIHtcblx0XHRcdEwuRG9tVXRpbC5zZXRQb3NpdGlvbihzaGFkb3csIGljb25Qb3MpO1xuXHRcdH1cblxuXHRcdG1hcmtlci5fbGF0bG5nID0gbGF0bG5nO1xuXG5cdFx0bWFya2VyXG5cdFx0ICAgIC5maXJlKCdtb3ZlJywge2xhdGxuZzogbGF0bG5nfSlcblx0XHQgICAgLmZpcmUoJ2RyYWcnKTtcblx0fSxcblxuXHRfb25EcmFnRW5kOiBmdW5jdGlvbiAoZSkge1xuXHRcdHRoaXMuX21hcmtlclxuXHRcdCAgICAuZmlyZSgnbW92ZWVuZCcpXG5cdFx0ICAgIC5maXJlKCdkcmFnZW5kJywgZSk7XG5cdH1cbn0pO1xuXG5cbi8qXHJcbiAqIEwuQ29udHJvbCBpcyBhIGJhc2UgY2xhc3MgZm9yIGltcGxlbWVudGluZyBtYXAgY29udHJvbHMuIEhhbmRsZXMgcG9zaXRpb25pbmcuXHJcbiAqIEFsbCBvdGhlciBjb250cm9scyBleHRlbmQgZnJvbSB0aGlzIGNsYXNzLlxyXG4gKi9cclxuXHJcbkwuQ29udHJvbCA9IEwuQ2xhc3MuZXh0ZW5kKHtcclxuXHRvcHRpb25zOiB7XHJcblx0XHRwb3NpdGlvbjogJ3RvcHJpZ2h0J1xyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XHJcblx0XHRMLnNldE9wdGlvbnModGhpcywgb3B0aW9ucyk7XHJcblx0fSxcclxuXHJcblx0Z2V0UG9zaXRpb246IGZ1bmN0aW9uICgpIHtcclxuXHRcdHJldHVybiB0aGlzLm9wdGlvbnMucG9zaXRpb247XHJcblx0fSxcclxuXHJcblx0c2V0UG9zaXRpb246IGZ1bmN0aW9uIChwb3NpdGlvbikge1xyXG5cdFx0dmFyIG1hcCA9IHRoaXMuX21hcDtcclxuXHJcblx0XHRpZiAobWFwKSB7XHJcblx0XHRcdG1hcC5yZW1vdmVDb250cm9sKHRoaXMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMub3B0aW9ucy5wb3NpdGlvbiA9IHBvc2l0aW9uO1xyXG5cclxuXHRcdGlmIChtYXApIHtcclxuXHRcdFx0bWFwLmFkZENvbnRyb2wodGhpcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0Z2V0Q29udGFpbmVyOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fY29udGFpbmVyO1xyXG5cdH0sXHJcblxyXG5cdGFkZFRvOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHR0aGlzLl9tYXAgPSBtYXA7XHJcblxyXG5cdFx0dmFyIGNvbnRhaW5lciA9IHRoaXMuX2NvbnRhaW5lciA9IHRoaXMub25BZGQobWFwKSxcclxuXHRcdCAgICBwb3MgPSB0aGlzLmdldFBvc2l0aW9uKCksXHJcblx0XHQgICAgY29ybmVyID0gbWFwLl9jb250cm9sQ29ybmVyc1twb3NdO1xyXG5cclxuXHRcdEwuRG9tVXRpbC5hZGRDbGFzcyhjb250YWluZXIsICdsZWFmbGV0LWNvbnRyb2wnKTtcclxuXHJcblx0XHRpZiAocG9zLmluZGV4T2YoJ2JvdHRvbScpICE9PSAtMSkge1xyXG5cdFx0XHRjb3JuZXIuaW5zZXJ0QmVmb3JlKGNvbnRhaW5lciwgY29ybmVyLmZpcnN0Q2hpbGQpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0Y29ybmVyLmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlRnJvbTogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0dmFyIHBvcyA9IHRoaXMuZ2V0UG9zaXRpb24oKSxcclxuXHRcdCAgICBjb3JuZXIgPSBtYXAuX2NvbnRyb2xDb3JuZXJzW3Bvc107XHJcblxyXG5cdFx0Y29ybmVyLnJlbW92ZUNoaWxkKHRoaXMuX2NvbnRhaW5lcik7XHJcblx0XHR0aGlzLl9tYXAgPSBudWxsO1xyXG5cclxuXHRcdGlmICh0aGlzLm9uUmVtb3ZlKSB7XHJcblx0XHRcdHRoaXMub25SZW1vdmUobWFwKTtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRfcmVmb2N1c09uTWFwOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAodGhpcy5fbWFwKSB7XHJcblx0XHRcdHRoaXMuX21hcC5nZXRDb250YWluZXIoKS5mb2N1cygpO1xyXG5cdFx0fVxyXG5cdH1cclxufSk7XHJcblxyXG5MLmNvbnRyb2wgPSBmdW5jdGlvbiAob3B0aW9ucykge1xyXG5cdHJldHVybiBuZXcgTC5Db250cm9sKG9wdGlvbnMpO1xyXG59O1xyXG5cclxuXHJcbi8vIGFkZHMgY29udHJvbC1yZWxhdGVkIG1ldGhvZHMgdG8gTC5NYXBcclxuXHJcbkwuTWFwLmluY2x1ZGUoe1xyXG5cdGFkZENvbnRyb2w6IGZ1bmN0aW9uIChjb250cm9sKSB7XHJcblx0XHRjb250cm9sLmFkZFRvKHRoaXMpO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlQ29udHJvbDogZnVuY3Rpb24gKGNvbnRyb2wpIHtcclxuXHRcdGNvbnRyb2wucmVtb3ZlRnJvbSh0aGlzKTtcclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdF9pbml0Q29udHJvbFBvczogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGNvcm5lcnMgPSB0aGlzLl9jb250cm9sQ29ybmVycyA9IHt9LFxyXG5cdFx0ICAgIGwgPSAnbGVhZmxldC0nLFxyXG5cdFx0ICAgIGNvbnRhaW5lciA9IHRoaXMuX2NvbnRyb2xDb250YWluZXIgPVxyXG5cdFx0ICAgICAgICAgICAgTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgbCArICdjb250cm9sLWNvbnRhaW5lcicsIHRoaXMuX2NvbnRhaW5lcik7XHJcblxyXG5cdFx0ZnVuY3Rpb24gY3JlYXRlQ29ybmVyKHZTaWRlLCBoU2lkZSkge1xyXG5cdFx0XHR2YXIgY2xhc3NOYW1lID0gbCArIHZTaWRlICsgJyAnICsgbCArIGhTaWRlO1xyXG5cclxuXHRcdFx0Y29ybmVyc1t2U2lkZSArIGhTaWRlXSA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsIGNsYXNzTmFtZSwgY29udGFpbmVyKTtcclxuXHRcdH1cclxuXHJcblx0XHRjcmVhdGVDb3JuZXIoJ3RvcCcsICdsZWZ0Jyk7XHJcblx0XHRjcmVhdGVDb3JuZXIoJ3RvcCcsICdyaWdodCcpO1xyXG5cdFx0Y3JlYXRlQ29ybmVyKCdib3R0b20nLCAnbGVmdCcpO1xyXG5cdFx0Y3JlYXRlQ29ybmVyKCdib3R0b20nLCAncmlnaHQnKTtcclxuXHR9LFxyXG5cclxuXHRfY2xlYXJDb250cm9sUG9zOiBmdW5jdGlvbiAoKSB7XHJcblx0XHR0aGlzLl9jb250YWluZXIucmVtb3ZlQ2hpbGQodGhpcy5fY29udHJvbENvbnRhaW5lcik7XHJcblx0fVxyXG59KTtcclxuXG5cbi8qXHJcbiAqIEwuQ29udHJvbC5ab29tIGlzIHVzZWQgZm9yIHRoZSBkZWZhdWx0IHpvb20gYnV0dG9ucyBvbiB0aGUgbWFwLlxyXG4gKi9cclxuXHJcbkwuQ29udHJvbC5ab29tID0gTC5Db250cm9sLmV4dGVuZCh7XHJcblx0b3B0aW9uczoge1xyXG5cdFx0cG9zaXRpb246ICd0b3BsZWZ0JyxcclxuXHRcdHpvb21JblRleHQ6ICcrJyxcclxuXHRcdHpvb21JblRpdGxlOiAnWm9vbSBpbicsXHJcblx0XHR6b29tT3V0VGV4dDogJy0nLFxyXG5cdFx0em9vbU91dFRpdGxlOiAnWm9vbSBvdXQnXHJcblx0fSxcclxuXHJcblx0b25BZGQ6IGZ1bmN0aW9uIChtYXApIHtcclxuXHRcdHZhciB6b29tTmFtZSA9ICdsZWFmbGV0LWNvbnRyb2wtem9vbScsXHJcblx0XHQgICAgY29udGFpbmVyID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2Jywgem9vbU5hbWUgKyAnIGxlYWZsZXQtYmFyJyk7XHJcblxyXG5cdFx0dGhpcy5fbWFwID0gbWFwO1xyXG5cclxuXHRcdHRoaXMuX3pvb21JbkJ1dHRvbiAgPSB0aGlzLl9jcmVhdGVCdXR0b24oXHJcblx0XHQgICAgICAgIHRoaXMub3B0aW9ucy56b29tSW5UZXh0LCB0aGlzLm9wdGlvbnMuem9vbUluVGl0bGUsXHJcblx0XHQgICAgICAgIHpvb21OYW1lICsgJy1pbicsICBjb250YWluZXIsIHRoaXMuX3pvb21JbiwgIHRoaXMpO1xyXG5cdFx0dGhpcy5fem9vbU91dEJ1dHRvbiA9IHRoaXMuX2NyZWF0ZUJ1dHRvbihcclxuXHRcdCAgICAgICAgdGhpcy5vcHRpb25zLnpvb21PdXRUZXh0LCB0aGlzLm9wdGlvbnMuem9vbU91dFRpdGxlLFxyXG5cdFx0ICAgICAgICB6b29tTmFtZSArICctb3V0JywgY29udGFpbmVyLCB0aGlzLl96b29tT3V0LCB0aGlzKTtcclxuXHJcblx0XHR0aGlzLl91cGRhdGVEaXNhYmxlZCgpO1xyXG5cdFx0bWFwLm9uKCd6b29tZW5kIHpvb21sZXZlbHNjaGFuZ2UnLCB0aGlzLl91cGRhdGVEaXNhYmxlZCwgdGhpcyk7XHJcblxyXG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcclxuXHR9LFxyXG5cclxuXHRvblJlbW92ZTogZnVuY3Rpb24gKG1hcCkge1xyXG5cdFx0bWFwLm9mZignem9vbWVuZCB6b29tbGV2ZWxzY2hhbmdlJywgdGhpcy5fdXBkYXRlRGlzYWJsZWQsIHRoaXMpO1xyXG5cdH0sXHJcblxyXG5cdF96b29tSW46IGZ1bmN0aW9uIChlKSB7XHJcblx0XHR0aGlzLl9tYXAuem9vbUluKGUuc2hpZnRLZXkgPyAzIDogMSk7XHJcblx0fSxcclxuXHJcblx0X3pvb21PdXQ6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHR0aGlzLl9tYXAuem9vbU91dChlLnNoaWZ0S2V5ID8gMyA6IDEpO1xyXG5cdH0sXHJcblxyXG5cdF9jcmVhdGVCdXR0b246IGZ1bmN0aW9uIChodG1sLCB0aXRsZSwgY2xhc3NOYW1lLCBjb250YWluZXIsIGZuLCBjb250ZXh0KSB7XHJcblx0XHR2YXIgbGluayA9IEwuRG9tVXRpbC5jcmVhdGUoJ2EnLCBjbGFzc05hbWUsIGNvbnRhaW5lcik7XHJcblx0XHRsaW5rLmlubmVySFRNTCA9IGh0bWw7XHJcblx0XHRsaW5rLmhyZWYgPSAnIyc7XHJcblx0XHRsaW5rLnRpdGxlID0gdGl0bGU7XHJcblxyXG5cdFx0dmFyIHN0b3AgPSBMLkRvbUV2ZW50LnN0b3BQcm9wYWdhdGlvbjtcclxuXHJcblx0XHRMLkRvbUV2ZW50XHJcblx0XHQgICAgLm9uKGxpbmssICdjbGljaycsIHN0b3ApXHJcblx0XHQgICAgLm9uKGxpbmssICdtb3VzZWRvd24nLCBzdG9wKVxyXG5cdFx0ICAgIC5vbihsaW5rLCAnZGJsY2xpY2snLCBzdG9wKVxyXG5cdFx0ICAgIC5vbihsaW5rLCAnY2xpY2snLCBMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KVxyXG5cdFx0ICAgIC5vbihsaW5rLCAnY2xpY2snLCBmbiwgY29udGV4dClcclxuXHRcdCAgICAub24obGluaywgJ2NsaWNrJywgdGhpcy5fcmVmb2N1c09uTWFwLCBjb250ZXh0KTtcclxuXHJcblx0XHRyZXR1cm4gbGluaztcclxuXHR9LFxyXG5cclxuXHRfdXBkYXRlRGlzYWJsZWQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBtYXAgPSB0aGlzLl9tYXAsXHJcblx0XHRcdGNsYXNzTmFtZSA9ICdsZWFmbGV0LWRpc2FibGVkJztcclxuXHJcblx0XHRMLkRvbVV0aWwucmVtb3ZlQ2xhc3ModGhpcy5fem9vbUluQnV0dG9uLCBjbGFzc05hbWUpO1xyXG5cdFx0TC5Eb21VdGlsLnJlbW92ZUNsYXNzKHRoaXMuX3pvb21PdXRCdXR0b24sIGNsYXNzTmFtZSk7XHJcblxyXG5cdFx0aWYgKG1hcC5fem9vbSA9PT0gbWFwLmdldE1pblpvb20oKSkge1xyXG5cdFx0XHRMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5fem9vbU91dEJ1dHRvbiwgY2xhc3NOYW1lKTtcclxuXHRcdH1cclxuXHRcdGlmIChtYXAuX3pvb20gPT09IG1hcC5nZXRNYXhab29tKCkpIHtcclxuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKHRoaXMuX3pvb21JbkJ1dHRvbiwgY2xhc3NOYW1lKTtcclxuXHRcdH1cclxuXHR9XHJcbn0pO1xyXG5cclxuTC5NYXAubWVyZ2VPcHRpb25zKHtcclxuXHR6b29tQ29udHJvbDogdHJ1ZVxyXG59KTtcclxuXHJcbkwuTWFwLmFkZEluaXRIb29rKGZ1bmN0aW9uICgpIHtcclxuXHRpZiAodGhpcy5vcHRpb25zLnpvb21Db250cm9sKSB7XHJcblx0XHR0aGlzLnpvb21Db250cm9sID0gbmV3IEwuQ29udHJvbC5ab29tKCk7XHJcblx0XHR0aGlzLmFkZENvbnRyb2wodGhpcy56b29tQ29udHJvbCk7XHJcblx0fVxyXG59KTtcclxuXHJcbkwuY29udHJvbC56b29tID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcclxuXHRyZXR1cm4gbmV3IEwuQ29udHJvbC5ab29tKG9wdGlvbnMpO1xyXG59O1xyXG5cclxuXG5cbi8qXHJcbiAqIEwuQ29udHJvbC5BdHRyaWJ1dGlvbiBpcyB1c2VkIGZvciBkaXNwbGF5aW5nIGF0dHJpYnV0aW9uIG9uIHRoZSBtYXAgKGFkZGVkIGJ5IGRlZmF1bHQpLlxyXG4gKi9cclxuXHJcbkwuQ29udHJvbC5BdHRyaWJ1dGlvbiA9IEwuQ29udHJvbC5leHRlbmQoe1xyXG5cdG9wdGlvbnM6IHtcclxuXHRcdHBvc2l0aW9uOiAnYm90dG9tcmlnaHQnLFxyXG5cdFx0cHJlZml4OiAnPGEgaHJlZj1cImh0dHA6Ly9sZWFmbGV0anMuY29tXCIgdGl0bGU9XCJBIEpTIGxpYnJhcnkgZm9yIGludGVyYWN0aXZlIG1hcHNcIj5MZWFmbGV0PC9hPidcclxuXHR9LFxyXG5cclxuXHRpbml0aWFsaXplOiBmdW5jdGlvbiAob3B0aW9ucykge1xyXG5cdFx0TC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xyXG5cclxuXHRcdHRoaXMuX2F0dHJpYnV0aW9ucyA9IHt9O1xyXG5cdH0sXHJcblxyXG5cdG9uQWRkOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHR0aGlzLl9jb250YWluZXIgPSBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCAnbGVhZmxldC1jb250cm9sLWF0dHJpYnV0aW9uJyk7XHJcblx0XHRMLkRvbUV2ZW50LmRpc2FibGVDbGlja1Byb3BhZ2F0aW9uKHRoaXMuX2NvbnRhaW5lcik7XHJcblxyXG5cdFx0Zm9yICh2YXIgaSBpbiBtYXAuX2xheWVycykge1xyXG5cdFx0XHRpZiAobWFwLl9sYXllcnNbaV0uZ2V0QXR0cmlidXRpb24pIHtcclxuXHRcdFx0XHR0aGlzLmFkZEF0dHJpYnV0aW9uKG1hcC5fbGF5ZXJzW2ldLmdldEF0dHJpYnV0aW9uKCkpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRcclxuXHRcdG1hcFxyXG5cdFx0ICAgIC5vbignbGF5ZXJhZGQnLCB0aGlzLl9vbkxheWVyQWRkLCB0aGlzKVxyXG5cdFx0ICAgIC5vbignbGF5ZXJyZW1vdmUnLCB0aGlzLl9vbkxheWVyUmVtb3ZlLCB0aGlzKTtcclxuXHJcblx0XHR0aGlzLl91cGRhdGUoKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpcy5fY29udGFpbmVyO1xyXG5cdH0sXHJcblxyXG5cdG9uUmVtb3ZlOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXBcclxuXHRcdCAgICAub2ZmKCdsYXllcmFkZCcsIHRoaXMuX29uTGF5ZXJBZGQpXHJcblx0XHQgICAgLm9mZignbGF5ZXJyZW1vdmUnLCB0aGlzLl9vbkxheWVyUmVtb3ZlKTtcclxuXHJcblx0fSxcclxuXHJcblx0c2V0UHJlZml4OiBmdW5jdGlvbiAocHJlZml4KSB7XHJcblx0XHR0aGlzLm9wdGlvbnMucHJlZml4ID0gcHJlZml4O1xyXG5cdFx0dGhpcy5fdXBkYXRlKCk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRhZGRBdHRyaWJ1dGlvbjogZnVuY3Rpb24gKHRleHQpIHtcclxuXHRcdGlmICghdGV4dCkgeyByZXR1cm47IH1cclxuXHJcblx0XHRpZiAoIXRoaXMuX2F0dHJpYnV0aW9uc1t0ZXh0XSkge1xyXG5cdFx0XHR0aGlzLl9hdHRyaWJ1dGlvbnNbdGV4dF0gPSAwO1xyXG5cdFx0fVxyXG5cdFx0dGhpcy5fYXR0cmlidXRpb25zW3RleHRdKys7XHJcblxyXG5cdFx0dGhpcy5fdXBkYXRlKCk7XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlQXR0cmlidXRpb246IGZ1bmN0aW9uICh0ZXh0KSB7XHJcblx0XHRpZiAoIXRleHQpIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0aWYgKHRoaXMuX2F0dHJpYnV0aW9uc1t0ZXh0XSkge1xyXG5cdFx0XHR0aGlzLl9hdHRyaWJ1dGlvbnNbdGV4dF0tLTtcclxuXHRcdFx0dGhpcy5fdXBkYXRlKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9tYXApIHsgcmV0dXJuOyB9XHJcblxyXG5cdFx0dmFyIGF0dHJpYnMgPSBbXTtcclxuXHJcblx0XHRmb3IgKHZhciBpIGluIHRoaXMuX2F0dHJpYnV0aW9ucykge1xyXG5cdFx0XHRpZiAodGhpcy5fYXR0cmlidXRpb25zW2ldKSB7XHJcblx0XHRcdFx0YXR0cmlicy5wdXNoKGkpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIHByZWZpeEFuZEF0dHJpYnMgPSBbXTtcclxuXHJcblx0XHRpZiAodGhpcy5vcHRpb25zLnByZWZpeCkge1xyXG5cdFx0XHRwcmVmaXhBbmRBdHRyaWJzLnB1c2godGhpcy5vcHRpb25zLnByZWZpeCk7XHJcblx0XHR9XHJcblx0XHRpZiAoYXR0cmlicy5sZW5ndGgpIHtcclxuXHRcdFx0cHJlZml4QW5kQXR0cmlicy5wdXNoKGF0dHJpYnMuam9pbignLCAnKSk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fY29udGFpbmVyLmlubmVySFRNTCA9IHByZWZpeEFuZEF0dHJpYnMuam9pbignIHwgJyk7XHJcblx0fSxcclxuXHJcblx0X29uTGF5ZXJBZGQ6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHRpZiAoZS5sYXllci5nZXRBdHRyaWJ1dGlvbikge1xyXG5cdFx0XHR0aGlzLmFkZEF0dHJpYnV0aW9uKGUubGF5ZXIuZ2V0QXR0cmlidXRpb24oKSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X29uTGF5ZXJSZW1vdmU6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHRpZiAoZS5sYXllci5nZXRBdHRyaWJ1dGlvbikge1xyXG5cdFx0XHR0aGlzLnJlbW92ZUF0dHJpYnV0aW9uKGUubGF5ZXIuZ2V0QXR0cmlidXRpb24oKSk7XHJcblx0XHR9XHJcblx0fVxyXG59KTtcclxuXHJcbkwuTWFwLm1lcmdlT3B0aW9ucyh7XHJcblx0YXR0cmlidXRpb25Db250cm9sOiB0cnVlXHJcbn0pO1xyXG5cclxuTC5NYXAuYWRkSW5pdEhvb2soZnVuY3Rpb24gKCkge1xyXG5cdGlmICh0aGlzLm9wdGlvbnMuYXR0cmlidXRpb25Db250cm9sKSB7XHJcblx0XHR0aGlzLmF0dHJpYnV0aW9uQ29udHJvbCA9IChuZXcgTC5Db250cm9sLkF0dHJpYnV0aW9uKCkpLmFkZFRvKHRoaXMpO1xyXG5cdH1cclxufSk7XHJcblxyXG5MLmNvbnRyb2wuYXR0cmlidXRpb24gPSBmdW5jdGlvbiAob3B0aW9ucykge1xyXG5cdHJldHVybiBuZXcgTC5Db250cm9sLkF0dHJpYnV0aW9uKG9wdGlvbnMpO1xyXG59O1xyXG5cblxuLypcbiAqIEwuQ29udHJvbC5TY2FsZSBpcyB1c2VkIGZvciBkaXNwbGF5aW5nIG1ldHJpYy9pbXBlcmlhbCBzY2FsZSBvbiB0aGUgbWFwLlxuICovXG5cbkwuQ29udHJvbC5TY2FsZSA9IEwuQ29udHJvbC5leHRlbmQoe1xuXHRvcHRpb25zOiB7XG5cdFx0cG9zaXRpb246ICdib3R0b21sZWZ0Jyxcblx0XHRtYXhXaWR0aDogMTAwLFxuXHRcdG1ldHJpYzogdHJ1ZSxcblx0XHRpbXBlcmlhbDogdHJ1ZSxcblx0XHR1cGRhdGVXaGVuSWRsZTogZmFsc2Vcblx0fSxcblxuXHRvbkFkZDogZnVuY3Rpb24gKG1hcCkge1xuXHRcdHRoaXMuX21hcCA9IG1hcDtcblxuXHRcdHZhciBjbGFzc05hbWUgPSAnbGVhZmxldC1jb250cm9sLXNjYWxlJyxcblx0XHQgICAgY29udGFpbmVyID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgY2xhc3NOYW1lKSxcblx0XHQgICAgb3B0aW9ucyA9IHRoaXMub3B0aW9ucztcblxuXHRcdHRoaXMuX2FkZFNjYWxlcyhvcHRpb25zLCBjbGFzc05hbWUsIGNvbnRhaW5lcik7XG5cblx0XHRtYXAub24ob3B0aW9ucy51cGRhdGVXaGVuSWRsZSA/ICdtb3ZlZW5kJyA6ICdtb3ZlJywgdGhpcy5fdXBkYXRlLCB0aGlzKTtcblx0XHRtYXAud2hlblJlYWR5KHRoaXMuX3VwZGF0ZSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9LFxuXG5cdG9uUmVtb3ZlOiBmdW5jdGlvbiAobWFwKSB7XG5cdFx0bWFwLm9mZih0aGlzLm9wdGlvbnMudXBkYXRlV2hlbklkbGUgPyAnbW92ZWVuZCcgOiAnbW92ZScsIHRoaXMuX3VwZGF0ZSwgdGhpcyk7XG5cdH0sXG5cblx0X2FkZFNjYWxlczogZnVuY3Rpb24gKG9wdGlvbnMsIGNsYXNzTmFtZSwgY29udGFpbmVyKSB7XG5cdFx0aWYgKG9wdGlvbnMubWV0cmljKSB7XG5cdFx0XHR0aGlzLl9tU2NhbGUgPSBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCBjbGFzc05hbWUgKyAnLWxpbmUnLCBjb250YWluZXIpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5pbXBlcmlhbCkge1xuXHRcdFx0dGhpcy5faVNjYWxlID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgY2xhc3NOYW1lICsgJy1saW5lJywgY29udGFpbmVyKTtcblx0XHR9XG5cdH0sXG5cblx0X3VwZGF0ZTogZnVuY3Rpb24gKCkge1xuXHRcdHZhciBib3VuZHMgPSB0aGlzLl9tYXAuZ2V0Qm91bmRzKCksXG5cdFx0ICAgIGNlbnRlckxhdCA9IGJvdW5kcy5nZXRDZW50ZXIoKS5sYXQsXG5cdFx0ICAgIGhhbGZXb3JsZE1ldGVycyA9IDYzNzgxMzcgKiBNYXRoLlBJICogTWF0aC5jb3MoY2VudGVyTGF0ICogTWF0aC5QSSAvIDE4MCksXG5cdFx0ICAgIGRpc3QgPSBoYWxmV29ybGRNZXRlcnMgKiAoYm91bmRzLmdldE5vcnRoRWFzdCgpLmxuZyAtIGJvdW5kcy5nZXRTb3V0aFdlc3QoKS5sbmcpIC8gMTgwLFxuXG5cdFx0ICAgIHNpemUgPSB0aGlzLl9tYXAuZ2V0U2l6ZSgpLFxuXHRcdCAgICBvcHRpb25zID0gdGhpcy5vcHRpb25zLFxuXHRcdCAgICBtYXhNZXRlcnMgPSAwO1xuXG5cdFx0aWYgKHNpemUueCA+IDApIHtcblx0XHRcdG1heE1ldGVycyA9IGRpc3QgKiAob3B0aW9ucy5tYXhXaWR0aCAvIHNpemUueCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXBkYXRlU2NhbGVzKG9wdGlvbnMsIG1heE1ldGVycyk7XG5cdH0sXG5cblx0X3VwZGF0ZVNjYWxlczogZnVuY3Rpb24gKG9wdGlvbnMsIG1heE1ldGVycykge1xuXHRcdGlmIChvcHRpb25zLm1ldHJpYyAmJiBtYXhNZXRlcnMpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZU1ldHJpYyhtYXhNZXRlcnMpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLmltcGVyaWFsICYmIG1heE1ldGVycykge1xuXHRcdFx0dGhpcy5fdXBkYXRlSW1wZXJpYWwobWF4TWV0ZXJzKTtcblx0XHR9XG5cdH0sXG5cblx0X3VwZGF0ZU1ldHJpYzogZnVuY3Rpb24gKG1heE1ldGVycykge1xuXHRcdHZhciBtZXRlcnMgPSB0aGlzLl9nZXRSb3VuZE51bShtYXhNZXRlcnMpO1xuXG5cdFx0dGhpcy5fbVNjYWxlLnN0eWxlLndpZHRoID0gdGhpcy5fZ2V0U2NhbGVXaWR0aChtZXRlcnMgLyBtYXhNZXRlcnMpICsgJ3B4Jztcblx0XHR0aGlzLl9tU2NhbGUuaW5uZXJIVE1MID0gbWV0ZXJzIDwgMTAwMCA/IG1ldGVycyArICcgbScgOiAobWV0ZXJzIC8gMTAwMCkgKyAnIGttJztcblx0fSxcblxuXHRfdXBkYXRlSW1wZXJpYWw6IGZ1bmN0aW9uIChtYXhNZXRlcnMpIHtcblx0XHR2YXIgbWF4RmVldCA9IG1heE1ldGVycyAqIDMuMjgwODM5OSxcblx0XHQgICAgc2NhbGUgPSB0aGlzLl9pU2NhbGUsXG5cdFx0ICAgIG1heE1pbGVzLCBtaWxlcywgZmVldDtcblxuXHRcdGlmIChtYXhGZWV0ID4gNTI4MCkge1xuXHRcdFx0bWF4TWlsZXMgPSBtYXhGZWV0IC8gNTI4MDtcblx0XHRcdG1pbGVzID0gdGhpcy5fZ2V0Um91bmROdW0obWF4TWlsZXMpO1xuXG5cdFx0XHRzY2FsZS5zdHlsZS53aWR0aCA9IHRoaXMuX2dldFNjYWxlV2lkdGgobWlsZXMgLyBtYXhNaWxlcykgKyAncHgnO1xuXHRcdFx0c2NhbGUuaW5uZXJIVE1MID0gbWlsZXMgKyAnIG1pJztcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRmZWV0ID0gdGhpcy5fZ2V0Um91bmROdW0obWF4RmVldCk7XG5cblx0XHRcdHNjYWxlLnN0eWxlLndpZHRoID0gdGhpcy5fZ2V0U2NhbGVXaWR0aChmZWV0IC8gbWF4RmVldCkgKyAncHgnO1xuXHRcdFx0c2NhbGUuaW5uZXJIVE1MID0gZmVldCArICcgZnQnO1xuXHRcdH1cblx0fSxcblxuXHRfZ2V0U2NhbGVXaWR0aDogZnVuY3Rpb24gKHJhdGlvKSB7XG5cdFx0cmV0dXJuIE1hdGgucm91bmQodGhpcy5vcHRpb25zLm1heFdpZHRoICogcmF0aW8pIC0gMTA7XG5cdH0sXG5cblx0X2dldFJvdW5kTnVtOiBmdW5jdGlvbiAobnVtKSB7XG5cdFx0dmFyIHBvdzEwID0gTWF0aC5wb3coMTAsIChNYXRoLmZsb29yKG51bSkgKyAnJykubGVuZ3RoIC0gMSksXG5cdFx0ICAgIGQgPSBudW0gLyBwb3cxMDtcblxuXHRcdGQgPSBkID49IDEwID8gMTAgOiBkID49IDUgPyA1IDogZCA+PSAzID8gMyA6IGQgPj0gMiA/IDIgOiAxO1xuXG5cdFx0cmV0dXJuIHBvdzEwICogZDtcblx0fVxufSk7XG5cbkwuY29udHJvbC5zY2FsZSA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cdHJldHVybiBuZXcgTC5Db250cm9sLlNjYWxlKG9wdGlvbnMpO1xufTtcblxuXG4vKlxyXG4gKiBMLkNvbnRyb2wuTGF5ZXJzIGlzIGEgY29udHJvbCB0byBhbGxvdyB1c2VycyB0byBzd2l0Y2ggYmV0d2VlbiBkaWZmZXJlbnQgbGF5ZXJzIG9uIHRoZSBtYXAuXHJcbiAqL1xyXG5cclxuTC5Db250cm9sLkxheWVycyA9IEwuQ29udHJvbC5leHRlbmQoe1xyXG5cdG9wdGlvbnM6IHtcclxuXHRcdGNvbGxhcHNlZDogdHJ1ZSxcclxuXHRcdHBvc2l0aW9uOiAndG9wcmlnaHQnLFxyXG5cdFx0YXV0b1pJbmRleDogdHJ1ZVxyXG5cdH0sXHJcblxyXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uIChiYXNlTGF5ZXJzLCBvdmVybGF5cywgb3B0aW9ucykge1xyXG5cdFx0TC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xyXG5cclxuXHRcdHRoaXMuX2xheWVycyA9IHt9O1xyXG5cdFx0dGhpcy5fbGFzdFpJbmRleCA9IDA7XHJcblx0XHR0aGlzLl9oYW5kbGluZ0NsaWNrID0gZmFsc2U7XHJcblxyXG5cdFx0Zm9yICh2YXIgaSBpbiBiYXNlTGF5ZXJzKSB7XHJcblx0XHRcdHRoaXMuX2FkZExheWVyKGJhc2VMYXllcnNbaV0sIGkpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGZvciAoaSBpbiBvdmVybGF5cykge1xyXG5cdFx0XHR0aGlzLl9hZGRMYXllcihvdmVybGF5c1tpXSwgaSwgdHJ1ZSk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0b25BZGQ6IGZ1bmN0aW9uIChtYXApIHtcclxuXHRcdHRoaXMuX2luaXRMYXlvdXQoKTtcclxuXHRcdHRoaXMuX3VwZGF0ZSgpO1xyXG5cclxuXHRcdG1hcFxyXG5cdFx0ICAgIC5vbignbGF5ZXJhZGQnLCB0aGlzLl9vbkxheWVyQ2hhbmdlLCB0aGlzKVxyXG5cdFx0ICAgIC5vbignbGF5ZXJyZW1vdmUnLCB0aGlzLl9vbkxheWVyQ2hhbmdlLCB0aGlzKTtcclxuXHJcblx0XHRyZXR1cm4gdGhpcy5fY29udGFpbmVyO1xyXG5cdH0sXHJcblxyXG5cdG9uUmVtb3ZlOiBmdW5jdGlvbiAobWFwKSB7XHJcblx0XHRtYXBcclxuXHRcdCAgICAub2ZmKCdsYXllcmFkZCcsIHRoaXMuX29uTGF5ZXJDaGFuZ2UsIHRoaXMpXHJcblx0XHQgICAgLm9mZignbGF5ZXJyZW1vdmUnLCB0aGlzLl9vbkxheWVyQ2hhbmdlLCB0aGlzKTtcclxuXHR9LFxyXG5cclxuXHRhZGRCYXNlTGF5ZXI6IGZ1bmN0aW9uIChsYXllciwgbmFtZSkge1xyXG5cdFx0dGhpcy5fYWRkTGF5ZXIobGF5ZXIsIG5hbWUpO1xyXG5cdFx0dGhpcy5fdXBkYXRlKCk7XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRhZGRPdmVybGF5OiBmdW5jdGlvbiAobGF5ZXIsIG5hbWUpIHtcclxuXHRcdHRoaXMuX2FkZExheWVyKGxheWVyLCBuYW1lLCB0cnVlKTtcclxuXHRcdHRoaXMuX3VwZGF0ZSgpO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0cmVtb3ZlTGF5ZXI6IGZ1bmN0aW9uIChsYXllcikge1xyXG5cdFx0dmFyIGlkID0gTC5zdGFtcChsYXllcik7XHJcblx0XHRkZWxldGUgdGhpcy5fbGF5ZXJzW2lkXTtcclxuXHRcdHRoaXMuX3VwZGF0ZSgpO1xyXG5cdFx0cmV0dXJuIHRoaXM7XHJcblx0fSxcclxuXHJcblx0X2luaXRMYXlvdXQ6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHZhciBjbGFzc05hbWUgPSAnbGVhZmxldC1jb250cm9sLWxheWVycycsXHJcblx0XHQgICAgY29udGFpbmVyID0gdGhpcy5fY29udGFpbmVyID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgY2xhc3NOYW1lKTtcclxuXHJcblx0XHQvL01ha2VzIHRoaXMgd29yayBvbiBJRTEwIFRvdWNoIGRldmljZXMgYnkgc3RvcHBpbmcgaXQgZnJvbSBmaXJpbmcgYSBtb3VzZW91dCBldmVudCB3aGVuIHRoZSB0b3VjaCBpcyByZWxlYXNlZFxyXG5cdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsIHRydWUpO1xyXG5cclxuXHRcdGlmICghTC5Ccm93c2VyLnRvdWNoKSB7XHJcblx0XHRcdEwuRG9tRXZlbnRcclxuXHRcdFx0XHQuZGlzYWJsZUNsaWNrUHJvcGFnYXRpb24oY29udGFpbmVyKVxyXG5cdFx0XHRcdC5kaXNhYmxlU2Nyb2xsUHJvcGFnYXRpb24oY29udGFpbmVyKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdEwuRG9tRXZlbnQub24oY29udGFpbmVyLCAnY2xpY2snLCBMLkRvbUV2ZW50LnN0b3BQcm9wYWdhdGlvbik7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIGZvcm0gPSB0aGlzLl9mb3JtID0gTC5Eb21VdGlsLmNyZWF0ZSgnZm9ybScsIGNsYXNzTmFtZSArICctbGlzdCcpO1xyXG5cclxuXHRcdGlmICh0aGlzLm9wdGlvbnMuY29sbGFwc2VkKSB7XHJcblx0XHRcdGlmICghTC5Ccm93c2VyLmFuZHJvaWQpIHtcclxuXHRcdFx0XHRMLkRvbUV2ZW50XHJcblx0XHRcdFx0ICAgIC5vbihjb250YWluZXIsICdtb3VzZW92ZXInLCB0aGlzLl9leHBhbmQsIHRoaXMpXHJcblx0XHRcdFx0ICAgIC5vbihjb250YWluZXIsICdtb3VzZW91dCcsIHRoaXMuX2NvbGxhcHNlLCB0aGlzKTtcclxuXHRcdFx0fVxyXG5cdFx0XHR2YXIgbGluayA9IHRoaXMuX2xheWVyc0xpbmsgPSBMLkRvbVV0aWwuY3JlYXRlKCdhJywgY2xhc3NOYW1lICsgJy10b2dnbGUnLCBjb250YWluZXIpO1xyXG5cdFx0XHRsaW5rLmhyZWYgPSAnIyc7XHJcblx0XHRcdGxpbmsudGl0bGUgPSAnTGF5ZXJzJztcclxuXHJcblx0XHRcdGlmIChMLkJyb3dzZXIudG91Y2gpIHtcclxuXHRcdFx0XHRMLkRvbUV2ZW50XHJcblx0XHRcdFx0ICAgIC5vbihsaW5rLCAnY2xpY2snLCBMLkRvbUV2ZW50LnN0b3ApXHJcblx0XHRcdFx0ICAgIC5vbihsaW5rLCAnY2xpY2snLCB0aGlzLl9leHBhbmQsIHRoaXMpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdEwuRG9tRXZlbnQub24obGluaywgJ2ZvY3VzJywgdGhpcy5fZXhwYW5kLCB0aGlzKTtcclxuXHRcdFx0fVxyXG5cdFx0XHQvL1dvcmsgYXJvdW5kIGZvciBGaXJlZm94IGFuZHJvaWQgaXNzdWUgaHR0cHM6Ly9naXRodWIuY29tL0xlYWZsZXQvTGVhZmxldC9pc3N1ZXMvMjAzM1xyXG5cdFx0XHRMLkRvbUV2ZW50Lm9uKGZvcm0sICdjbGljaycsIGZ1bmN0aW9uICgpIHtcclxuXHRcdFx0XHRzZXRUaW1lb3V0KEwuYmluZCh0aGlzLl9vbklucHV0Q2xpY2ssIHRoaXMpLCAwKTtcclxuXHRcdFx0fSwgdGhpcyk7XHJcblxyXG5cdFx0XHR0aGlzLl9tYXAub24oJ2NsaWNrJywgdGhpcy5fY29sbGFwc2UsIHRoaXMpO1xyXG5cdFx0XHQvLyBUT0RPIGtleWJvYXJkIGFjY2Vzc2liaWxpdHlcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMuX2V4cGFuZCgpO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2Jhc2VMYXllcnNMaXN0ID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgY2xhc3NOYW1lICsgJy1iYXNlJywgZm9ybSk7XHJcblx0XHR0aGlzLl9zZXBhcmF0b3IgPSBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCBjbGFzc05hbWUgKyAnLXNlcGFyYXRvcicsIGZvcm0pO1xyXG5cdFx0dGhpcy5fb3ZlcmxheXNMaXN0ID0gTC5Eb21VdGlsLmNyZWF0ZSgnZGl2JywgY2xhc3NOYW1lICsgJy1vdmVybGF5cycsIGZvcm0pO1xyXG5cclxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChmb3JtKTtcclxuXHR9LFxyXG5cclxuXHRfYWRkTGF5ZXI6IGZ1bmN0aW9uIChsYXllciwgbmFtZSwgb3ZlcmxheSkge1xyXG5cdFx0dmFyIGlkID0gTC5zdGFtcChsYXllcik7XHJcblxyXG5cdFx0dGhpcy5fbGF5ZXJzW2lkXSA9IHtcclxuXHRcdFx0bGF5ZXI6IGxheWVyLFxyXG5cdFx0XHRuYW1lOiBuYW1lLFxyXG5cdFx0XHRvdmVybGF5OiBvdmVybGF5XHJcblx0XHR9O1xyXG5cclxuXHRcdGlmICh0aGlzLm9wdGlvbnMuYXV0b1pJbmRleCAmJiBsYXllci5zZXRaSW5kZXgpIHtcclxuXHRcdFx0dGhpcy5fbGFzdFpJbmRleCsrO1xyXG5cdFx0XHRsYXllci5zZXRaSW5kZXgodGhpcy5fbGFzdFpJbmRleCk7XHJcblx0XHR9XHJcblx0fSxcclxuXHJcblx0X3VwZGF0ZTogZnVuY3Rpb24gKCkge1xyXG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2Jhc2VMYXllcnNMaXN0LmlubmVySFRNTCA9ICcnO1xyXG5cdFx0dGhpcy5fb3ZlcmxheXNMaXN0LmlubmVySFRNTCA9ICcnO1xyXG5cclxuXHRcdHZhciBiYXNlTGF5ZXJzUHJlc2VudCA9IGZhbHNlLFxyXG5cdFx0ICAgIG92ZXJsYXlzUHJlc2VudCA9IGZhbHNlLFxyXG5cdFx0ICAgIGksIG9iajtcclxuXHJcblx0XHRmb3IgKGkgaW4gdGhpcy5fbGF5ZXJzKSB7XHJcblx0XHRcdG9iaiA9IHRoaXMuX2xheWVyc1tpXTtcclxuXHRcdFx0dGhpcy5fYWRkSXRlbShvYmopO1xyXG5cdFx0XHRvdmVybGF5c1ByZXNlbnQgPSBvdmVybGF5c1ByZXNlbnQgfHwgb2JqLm92ZXJsYXk7XHJcblx0XHRcdGJhc2VMYXllcnNQcmVzZW50ID0gYmFzZUxheWVyc1ByZXNlbnQgfHwgIW9iai5vdmVybGF5O1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3NlcGFyYXRvci5zdHlsZS5kaXNwbGF5ID0gb3ZlcmxheXNQcmVzZW50ICYmIGJhc2VMYXllcnNQcmVzZW50ID8gJycgOiAnbm9uZSc7XHJcblx0fSxcclxuXHJcblx0X29uTGF5ZXJDaGFuZ2U6IGZ1bmN0aW9uIChlKSB7XHJcblx0XHR2YXIgb2JqID0gdGhpcy5fbGF5ZXJzW0wuc3RhbXAoZS5sYXllcildO1xyXG5cclxuXHRcdGlmICghb2JqKSB7IHJldHVybjsgfVxyXG5cclxuXHRcdGlmICghdGhpcy5faGFuZGxpbmdDbGljaykge1xyXG5cdFx0XHR0aGlzLl91cGRhdGUoKTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgdHlwZSA9IG9iai5vdmVybGF5ID9cclxuXHRcdFx0KGUudHlwZSA9PT0gJ2xheWVyYWRkJyA/ICdvdmVybGF5YWRkJyA6ICdvdmVybGF5cmVtb3ZlJykgOlxyXG5cdFx0XHQoZS50eXBlID09PSAnbGF5ZXJhZGQnID8gJ2Jhc2VsYXllcmNoYW5nZScgOiBudWxsKTtcclxuXHJcblx0XHRpZiAodHlwZSkge1xyXG5cdFx0XHR0aGlzLl9tYXAuZmlyZSh0eXBlLCBvYmopO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdC8vIElFNyBidWdzIG91dCBpZiB5b3UgY3JlYXRlIGEgcmFkaW8gZHluYW1pY2FsbHksIHNvIHlvdSBoYXZlIHRvIGRvIGl0IHRoaXMgaGFja3kgd2F5IChzZWUgaHR0cDovL2JpdC5seS9QcVlMQmUpXHJcblx0X2NyZWF0ZVJhZGlvRWxlbWVudDogZnVuY3Rpb24gKG5hbWUsIGNoZWNrZWQpIHtcclxuXHJcblx0XHR2YXIgcmFkaW9IdG1sID0gJzxpbnB1dCB0eXBlPVwicmFkaW9cIiBjbGFzcz1cImxlYWZsZXQtY29udHJvbC1sYXllcnMtc2VsZWN0b3JcIiBuYW1lPVwiJyArIG5hbWUgKyAnXCInO1xyXG5cdFx0aWYgKGNoZWNrZWQpIHtcclxuXHRcdFx0cmFkaW9IdG1sICs9ICcgY2hlY2tlZD1cImNoZWNrZWRcIic7XHJcblx0XHR9XHJcblx0XHRyYWRpb0h0bWwgKz0gJy8+JztcclxuXHJcblx0XHR2YXIgcmFkaW9GcmFnbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG5cdFx0cmFkaW9GcmFnbWVudC5pbm5lckhUTUwgPSByYWRpb0h0bWw7XHJcblxyXG5cdFx0cmV0dXJuIHJhZGlvRnJhZ21lbnQuZmlyc3RDaGlsZDtcclxuXHR9LFxyXG5cclxuXHRfYWRkSXRlbTogZnVuY3Rpb24gKG9iaikge1xyXG5cdFx0dmFyIGxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGFiZWwnKSxcclxuXHRcdCAgICBpbnB1dCxcclxuXHRcdCAgICBjaGVja2VkID0gdGhpcy5fbWFwLmhhc0xheWVyKG9iai5sYXllcik7XHJcblxyXG5cdFx0aWYgKG9iai5vdmVybGF5KSB7XHJcblx0XHRcdGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcclxuXHRcdFx0aW5wdXQudHlwZSA9ICdjaGVja2JveCc7XHJcblx0XHRcdGlucHV0LmNsYXNzTmFtZSA9ICdsZWFmbGV0LWNvbnRyb2wtbGF5ZXJzLXNlbGVjdG9yJztcclxuXHRcdFx0aW5wdXQuZGVmYXVsdENoZWNrZWQgPSBjaGVja2VkO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0aW5wdXQgPSB0aGlzLl9jcmVhdGVSYWRpb0VsZW1lbnQoJ2xlYWZsZXQtYmFzZS1sYXllcnMnLCBjaGVja2VkKTtcclxuXHRcdH1cclxuXHJcblx0XHRpbnB1dC5sYXllcklkID0gTC5zdGFtcChvYmoubGF5ZXIpO1xyXG5cclxuXHRcdEwuRG9tRXZlbnQub24oaW5wdXQsICdjbGljaycsIHRoaXMuX29uSW5wdXRDbGljaywgdGhpcyk7XHJcblxyXG5cdFx0dmFyIG5hbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XHJcblx0XHRuYW1lLmlubmVySFRNTCA9ICcgJyArIG9iai5uYW1lO1xyXG5cclxuXHRcdGxhYmVsLmFwcGVuZENoaWxkKGlucHV0KTtcclxuXHRcdGxhYmVsLmFwcGVuZENoaWxkKG5hbWUpO1xyXG5cclxuXHRcdHZhciBjb250YWluZXIgPSBvYmoub3ZlcmxheSA/IHRoaXMuX292ZXJsYXlzTGlzdCA6IHRoaXMuX2Jhc2VMYXllcnNMaXN0O1xyXG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGxhYmVsKTtcclxuXHJcblx0XHRyZXR1cm4gbGFiZWw7XHJcblx0fSxcclxuXHJcblx0X29uSW5wdXRDbGljazogZnVuY3Rpb24gKCkge1xyXG5cdFx0dmFyIGksIGlucHV0LCBvYmosXHJcblx0XHQgICAgaW5wdXRzID0gdGhpcy5fZm9ybS5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaW5wdXQnKSxcclxuXHRcdCAgICBpbnB1dHNMZW4gPSBpbnB1dHMubGVuZ3RoO1xyXG5cclxuXHRcdHRoaXMuX2hhbmRsaW5nQ2xpY2sgPSB0cnVlO1xyXG5cclxuXHRcdGZvciAoaSA9IDA7IGkgPCBpbnB1dHNMZW47IGkrKykge1xyXG5cdFx0XHRpbnB1dCA9IGlucHV0c1tpXTtcclxuXHRcdFx0b2JqID0gdGhpcy5fbGF5ZXJzW2lucHV0LmxheWVySWRdO1xyXG5cclxuXHRcdFx0aWYgKGlucHV0LmNoZWNrZWQgJiYgIXRoaXMuX21hcC5oYXNMYXllcihvYmoubGF5ZXIpKSB7XHJcblx0XHRcdFx0dGhpcy5fbWFwLmFkZExheWVyKG9iai5sYXllcik7XHJcblxyXG5cdFx0XHR9IGVsc2UgaWYgKCFpbnB1dC5jaGVja2VkICYmIHRoaXMuX21hcC5oYXNMYXllcihvYmoubGF5ZXIpKSB7XHJcblx0XHRcdFx0dGhpcy5fbWFwLnJlbW92ZUxheWVyKG9iai5sYXllcik7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9oYW5kbGluZ0NsaWNrID0gZmFsc2U7XHJcblxyXG5cdFx0dGhpcy5fcmVmb2N1c09uTWFwKCk7XHJcblx0fSxcclxuXHJcblx0X2V4cGFuZDogZnVuY3Rpb24gKCkge1xyXG5cdFx0TC5Eb21VdGlsLmFkZENsYXNzKHRoaXMuX2NvbnRhaW5lciwgJ2xlYWZsZXQtY29udHJvbC1sYXllcnMtZXhwYW5kZWQnKTtcclxuXHR9LFxyXG5cclxuXHRfY29sbGFwc2U6IGZ1bmN0aW9uICgpIHtcclxuXHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc05hbWUgPSB0aGlzLl9jb250YWluZXIuY2xhc3NOYW1lLnJlcGxhY2UoJyBsZWFmbGV0LWNvbnRyb2wtbGF5ZXJzLWV4cGFuZGVkJywgJycpO1xyXG5cdH1cclxufSk7XHJcblxyXG5MLmNvbnRyb2wubGF5ZXJzID0gZnVuY3Rpb24gKGJhc2VMYXllcnMsIG92ZXJsYXlzLCBvcHRpb25zKSB7XHJcblx0cmV0dXJuIG5ldyBMLkNvbnRyb2wuTGF5ZXJzKGJhc2VMYXllcnMsIG92ZXJsYXlzLCBvcHRpb25zKTtcclxufTtcclxuXG5cbi8qXG4gKiBMLlBvc0FuaW1hdGlvbiBpcyB1c2VkIGJ5IExlYWZsZXQgaW50ZXJuYWxseSBmb3IgcGFuIGFuaW1hdGlvbnMuXG4gKi9cblxuTC5Qb3NBbmltYXRpb24gPSBMLkNsYXNzLmV4dGVuZCh7XG5cdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcblxuXHRydW46IGZ1bmN0aW9uIChlbCwgbmV3UG9zLCBkdXJhdGlvbiwgZWFzZUxpbmVhcml0eSkgeyAvLyAoSFRNTEVsZW1lbnQsIFBvaW50WywgTnVtYmVyLCBOdW1iZXJdKVxuXHRcdHRoaXMuc3RvcCgpO1xuXG5cdFx0dGhpcy5fZWwgPSBlbDtcblx0XHR0aGlzLl9pblByb2dyZXNzID0gdHJ1ZTtcblx0XHR0aGlzLl9uZXdQb3MgPSBuZXdQb3M7XG5cblx0XHR0aGlzLmZpcmUoJ3N0YXJ0Jyk7XG5cblx0XHRlbC5zdHlsZVtMLkRvbVV0aWwuVFJBTlNJVElPTl0gPSAnYWxsICcgKyAoZHVyYXRpb24gfHwgMC4yNSkgK1xuXHRcdCAgICAgICAgJ3MgY3ViaWMtYmV6aWVyKDAsMCwnICsgKGVhc2VMaW5lYXJpdHkgfHwgMC41KSArICcsMSknO1xuXG5cdFx0TC5Eb21FdmVudC5vbihlbCwgTC5Eb21VdGlsLlRSQU5TSVRJT05fRU5ELCB0aGlzLl9vblRyYW5zaXRpb25FbmQsIHRoaXMpO1xuXHRcdEwuRG9tVXRpbC5zZXRQb3NpdGlvbihlbCwgbmV3UG9zKTtcblxuXHRcdC8vIHRvZ2dsZSByZWZsb3csIENocm9tZSBmbGlja2VycyBmb3Igc29tZSByZWFzb24gaWYgeW91IGRvbid0IGRvIHRoaXNcblx0XHRMLlV0aWwuZmFsc2VGbihlbC5vZmZzZXRXaWR0aCk7XG5cblx0XHQvLyB0aGVyZSdzIG5vIG5hdGl2ZSB3YXkgdG8gdHJhY2sgdmFsdWUgdXBkYXRlcyBvZiB0cmFuc2l0aW9uZWQgcHJvcGVydGllcywgc28gd2UgaW1pdGF0ZSB0aGlzXG5cdFx0dGhpcy5fc3RlcFRpbWVyID0gc2V0SW50ZXJ2YWwoTC5iaW5kKHRoaXMuX29uU3RlcCwgdGhpcyksIDUwKTtcblx0fSxcblxuXHRzdG9wOiBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCF0aGlzLl9pblByb2dyZXNzKSB7IHJldHVybjsgfVxuXG5cdFx0Ly8gaWYgd2UganVzdCByZW1vdmVkIHRoZSB0cmFuc2l0aW9uIHByb3BlcnR5LCB0aGUgZWxlbWVudCB3b3VsZCBqdW1wIHRvIGl0cyBmaW5hbCBwb3NpdGlvbixcblx0XHQvLyBzbyB3ZSBuZWVkIHRvIG1ha2UgaXQgc3RheSBhdCB0aGUgY3VycmVudCBwb3NpdGlvblxuXG5cdFx0TC5Eb21VdGlsLnNldFBvc2l0aW9uKHRoaXMuX2VsLCB0aGlzLl9nZXRQb3MoKSk7XG5cdFx0dGhpcy5fb25UcmFuc2l0aW9uRW5kKCk7XG5cdFx0TC5VdGlsLmZhbHNlRm4odGhpcy5fZWwub2Zmc2V0V2lkdGgpOyAvLyBmb3JjZSByZWZsb3cgaW4gY2FzZSB3ZSBhcmUgYWJvdXQgdG8gc3RhcnQgYSBuZXcgYW5pbWF0aW9uXG5cdH0sXG5cblx0X29uU3RlcDogZnVuY3Rpb24gKCkge1xuXHRcdHZhciBzdGVwUG9zID0gdGhpcy5fZ2V0UG9zKCk7XG5cdFx0aWYgKCFzdGVwUG9zKSB7XG5cdFx0XHR0aGlzLl9vblRyYW5zaXRpb25FbmQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8ganNoaW50IGNhbWVsY2FzZTogZmFsc2Vcblx0XHQvLyBtYWtlIEwuRG9tVXRpbC5nZXRQb3NpdGlvbiByZXR1cm4gaW50ZXJtZWRpYXRlIHBvc2l0aW9uIHZhbHVlIGR1cmluZyBhbmltYXRpb25cblx0XHR0aGlzLl9lbC5fbGVhZmxldF9wb3MgPSBzdGVwUG9zO1xuXG5cdFx0dGhpcy5maXJlKCdzdGVwJyk7XG5cdH0sXG5cblx0Ly8geW91IGNhbid0IGVhc2lseSBnZXQgaW50ZXJtZWRpYXRlIHZhbHVlcyBvZiBwcm9wZXJ0aWVzIGFuaW1hdGVkIHdpdGggQ1NTMyBUcmFuc2l0aW9ucyxcblx0Ly8gd2UgbmVlZCB0byBwYXJzZSBjb21wdXRlZCBzdHlsZSAoaW4gY2FzZSBvZiB0cmFuc2Zvcm0gaXQgcmV0dXJucyBtYXRyaXggc3RyaW5nKVxuXG5cdF90cmFuc2Zvcm1SZTogLyhbLStdPyg/OlxcZCpcXC4pP1xcZCspXFxEKiwgKFstK10/KD86XFxkKlxcLik/XFxkKylcXEQqXFwpLyxcblxuXHRfZ2V0UG9zOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGxlZnQsIHRvcCwgbWF0Y2hlcyxcblx0XHQgICAgZWwgPSB0aGlzLl9lbCxcblx0XHQgICAgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbCk7XG5cblx0XHRpZiAoTC5Ccm93c2VyLmFueTNkKSB7XG5cdFx0XHRtYXRjaGVzID0gc3R5bGVbTC5Eb21VdGlsLlRSQU5TRk9STV0ubWF0Y2godGhpcy5fdHJhbnNmb3JtUmUpO1xuXHRcdFx0aWYgKCFtYXRjaGVzKSB7IHJldHVybjsgfVxuXHRcdFx0bGVmdCA9IHBhcnNlRmxvYXQobWF0Y2hlc1sxXSk7XG5cdFx0XHR0b3AgID0gcGFyc2VGbG9hdChtYXRjaGVzWzJdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGVmdCA9IHBhcnNlRmxvYXQoc3R5bGUubGVmdCk7XG5cdFx0XHR0b3AgID0gcGFyc2VGbG9hdChzdHlsZS50b3ApO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgTC5Qb2ludChsZWZ0LCB0b3AsIHRydWUpO1xuXHR9LFxuXG5cdF9vblRyYW5zaXRpb25FbmQ6IGZ1bmN0aW9uICgpIHtcblx0XHRMLkRvbUV2ZW50Lm9mZih0aGlzLl9lbCwgTC5Eb21VdGlsLlRSQU5TSVRJT05fRU5ELCB0aGlzLl9vblRyYW5zaXRpb25FbmQsIHRoaXMpO1xuXG5cdFx0aWYgKCF0aGlzLl9pblByb2dyZXNzKSB7IHJldHVybjsgfVxuXHRcdHRoaXMuX2luUHJvZ3Jlc3MgPSBmYWxzZTtcblxuXHRcdHRoaXMuX2VsLnN0eWxlW0wuRG9tVXRpbC5UUkFOU0lUSU9OXSA9ICcnO1xuXG5cdFx0Ly8ganNoaW50IGNhbWVsY2FzZTogZmFsc2Vcblx0XHQvLyBtYWtlIHN1cmUgTC5Eb21VdGlsLmdldFBvc2l0aW9uIHJldHVybnMgdGhlIGZpbmFsIHBvc2l0aW9uIHZhbHVlIGFmdGVyIGFuaW1hdGlvblxuXHRcdHRoaXMuX2VsLl9sZWFmbGV0X3BvcyA9IHRoaXMuX25ld1BvcztcblxuXHRcdGNsZWFySW50ZXJ2YWwodGhpcy5fc3RlcFRpbWVyKTtcblxuXHRcdHRoaXMuZmlyZSgnc3RlcCcpLmZpcmUoJ2VuZCcpO1xuXHR9XG5cbn0pO1xuXG5cbi8qXG4gKiBFeHRlbmRzIEwuTWFwIHRvIGhhbmRsZSBwYW5uaW5nIGFuaW1hdGlvbnMuXG4gKi9cblxuTC5NYXAuaW5jbHVkZSh7XG5cblx0c2V0VmlldzogZnVuY3Rpb24gKGNlbnRlciwgem9vbSwgb3B0aW9ucykge1xuXG5cdFx0em9vbSA9IHpvb20gPT09IHVuZGVmaW5lZCA/IHRoaXMuX3pvb20gOiB0aGlzLl9saW1pdFpvb20oem9vbSk7XG5cdFx0Y2VudGVyID0gdGhpcy5fbGltaXRDZW50ZXIoTC5sYXRMbmcoY2VudGVyKSwgem9vbSwgdGhpcy5vcHRpb25zLm1heEJvdW5kcyk7XG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0XHRpZiAodGhpcy5fcGFuQW5pbSkge1xuXHRcdFx0dGhpcy5fcGFuQW5pbS5zdG9wKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2xvYWRlZCAmJiAhb3B0aW9ucy5yZXNldCAmJiBvcHRpb25zICE9PSB0cnVlKSB7XG5cblx0XHRcdGlmIChvcHRpb25zLmFuaW1hdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRvcHRpb25zLnpvb20gPSBMLmV4dGVuZCh7YW5pbWF0ZTogb3B0aW9ucy5hbmltYXRlfSwgb3B0aW9ucy56b29tKTtcblx0XHRcdFx0b3B0aW9ucy5wYW4gPSBMLmV4dGVuZCh7YW5pbWF0ZTogb3B0aW9ucy5hbmltYXRlfSwgb3B0aW9ucy5wYW4pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB0cnkgYW5pbWF0aW5nIHBhbiBvciB6b29tXG5cdFx0XHR2YXIgYW5pbWF0ZWQgPSAodGhpcy5fem9vbSAhPT0gem9vbSkgP1xuXHRcdFx0XHR0aGlzLl90cnlBbmltYXRlZFpvb20gJiYgdGhpcy5fdHJ5QW5pbWF0ZWRab29tKGNlbnRlciwgem9vbSwgb3B0aW9ucy56b29tKSA6XG5cdFx0XHRcdHRoaXMuX3RyeUFuaW1hdGVkUGFuKGNlbnRlciwgb3B0aW9ucy5wYW4pO1xuXG5cdFx0XHRpZiAoYW5pbWF0ZWQpIHtcblx0XHRcdFx0Ly8gcHJldmVudCByZXNpemUgaGFuZGxlciBjYWxsLCB0aGUgdmlldyB3aWxsIHJlZnJlc2ggYWZ0ZXIgYW5pbWF0aW9uIGFueXdheVxuXHRcdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fc2l6ZVRpbWVyKTtcblx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gYW5pbWF0aW9uIGRpZG4ndCBzdGFydCwganVzdCByZXNldCB0aGUgbWFwIHZpZXdcblx0XHR0aGlzLl9yZXNldFZpZXcoY2VudGVyLCB6b29tKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHBhbkJ5OiBmdW5jdGlvbiAob2Zmc2V0LCBvcHRpb25zKSB7XG5cdFx0b2Zmc2V0ID0gTC5wb2ludChvZmZzZXQpLnJvdW5kKCk7XG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0XHRpZiAoIW9mZnNldC54ICYmICFvZmZzZXQueSkge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9wYW5BbmltKSB7XG5cdFx0XHR0aGlzLl9wYW5BbmltID0gbmV3IEwuUG9zQW5pbWF0aW9uKCk7XG5cblx0XHRcdHRoaXMuX3BhbkFuaW0ub24oe1xuXHRcdFx0XHQnc3RlcCc6IHRoaXMuX29uUGFuVHJhbnNpdGlvblN0ZXAsXG5cdFx0XHRcdCdlbmQnOiB0aGlzLl9vblBhblRyYW5zaXRpb25FbmRcblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblxuXHRcdC8vIGRvbid0IGZpcmUgbW92ZXN0YXJ0IGlmIGFuaW1hdGluZyBpbmVydGlhXG5cdFx0aWYgKCFvcHRpb25zLm5vTW92ZVN0YXJ0KSB7XG5cdFx0XHR0aGlzLmZpcmUoJ21vdmVzdGFydCcpO1xuXHRcdH1cblxuXHRcdC8vIGFuaW1hdGUgcGFuIHVubGVzcyBhbmltYXRlOiBmYWxzZSBzcGVjaWZpZWRcblx0XHRpZiAob3B0aW9ucy5hbmltYXRlICE9PSBmYWxzZSkge1xuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKHRoaXMuX21hcFBhbmUsICdsZWFmbGV0LXBhbi1hbmltJyk7XG5cblx0XHRcdHZhciBuZXdQb3MgPSB0aGlzLl9nZXRNYXBQYW5lUG9zKCkuc3VidHJhY3Qob2Zmc2V0KTtcblx0XHRcdHRoaXMuX3BhbkFuaW0ucnVuKHRoaXMuX21hcFBhbmUsIG5ld1Bvcywgb3B0aW9ucy5kdXJhdGlvbiB8fCAwLjI1LCBvcHRpb25zLmVhc2VMaW5lYXJpdHkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yYXdQYW5CeShvZmZzZXQpO1xuXHRcdFx0dGhpcy5maXJlKCdtb3ZlJykuZmlyZSgnbW92ZWVuZCcpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdF9vblBhblRyYW5zaXRpb25TdGVwOiBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy5maXJlKCdtb3ZlJyk7XG5cdH0sXG5cblx0X29uUGFuVHJhbnNpdGlvbkVuZDogZnVuY3Rpb24gKCkge1xuXHRcdEwuRG9tVXRpbC5yZW1vdmVDbGFzcyh0aGlzLl9tYXBQYW5lLCAnbGVhZmxldC1wYW4tYW5pbScpO1xuXHRcdHRoaXMuZmlyZSgnbW92ZWVuZCcpO1xuXHR9LFxuXG5cdF90cnlBbmltYXRlZFBhbjogZnVuY3Rpb24gKGNlbnRlciwgb3B0aW9ucykge1xuXHRcdC8vIGRpZmZlcmVuY2UgYmV0d2VlbiB0aGUgbmV3IGFuZCBjdXJyZW50IGNlbnRlcnMgaW4gcGl4ZWxzXG5cdFx0dmFyIG9mZnNldCA9IHRoaXMuX2dldENlbnRlck9mZnNldChjZW50ZXIpLl9mbG9vcigpO1xuXG5cdFx0Ly8gZG9uJ3QgYW5pbWF0ZSB0b28gZmFyIHVubGVzcyBhbmltYXRlOiB0cnVlIHNwZWNpZmllZCBpbiBvcHRpb25zXG5cdFx0aWYgKChvcHRpb25zICYmIG9wdGlvbnMuYW5pbWF0ZSkgIT09IHRydWUgJiYgIXRoaXMuZ2V0U2l6ZSgpLmNvbnRhaW5zKG9mZnNldCkpIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0XHR0aGlzLnBhbkJ5KG9mZnNldCwgb3B0aW9ucyk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufSk7XG5cblxuLypcbiAqIEwuUG9zQW5pbWF0aW9uIGZhbGxiYWNrIGltcGxlbWVudGF0aW9uIHRoYXQgcG93ZXJzIExlYWZsZXQgcGFuIGFuaW1hdGlvbnNcbiAqIGluIGJyb3dzZXJzIHRoYXQgZG9uJ3Qgc3VwcG9ydCBDU1MzIFRyYW5zaXRpb25zLlxuICovXG5cbkwuUG9zQW5pbWF0aW9uID0gTC5Eb21VdGlsLlRSQU5TSVRJT04gPyBMLlBvc0FuaW1hdGlvbiA6IEwuUG9zQW5pbWF0aW9uLmV4dGVuZCh7XG5cblx0cnVuOiBmdW5jdGlvbiAoZWwsIG5ld1BvcywgZHVyYXRpb24sIGVhc2VMaW5lYXJpdHkpIHsgLy8gKEhUTUxFbGVtZW50LCBQb2ludFssIE51bWJlciwgTnVtYmVyXSlcblx0XHR0aGlzLnN0b3AoKTtcblxuXHRcdHRoaXMuX2VsID0gZWw7XG5cdFx0dGhpcy5faW5Qcm9ncmVzcyA9IHRydWU7XG5cdFx0dGhpcy5fZHVyYXRpb24gPSBkdXJhdGlvbiB8fCAwLjI1O1xuXHRcdHRoaXMuX2Vhc2VPdXRQb3dlciA9IDEgLyBNYXRoLm1heChlYXNlTGluZWFyaXR5IHx8IDAuNSwgMC4yKTtcblxuXHRcdHRoaXMuX3N0YXJ0UG9zID0gTC5Eb21VdGlsLmdldFBvc2l0aW9uKGVsKTtcblx0XHR0aGlzLl9vZmZzZXQgPSBuZXdQb3Muc3VidHJhY3QodGhpcy5fc3RhcnRQb3MpO1xuXHRcdHRoaXMuX3N0YXJ0VGltZSA9ICtuZXcgRGF0ZSgpO1xuXG5cdFx0dGhpcy5maXJlKCdzdGFydCcpO1xuXG5cdFx0dGhpcy5fYW5pbWF0ZSgpO1xuXHR9LFxuXG5cdHN0b3A6IGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoIXRoaXMuX2luUHJvZ3Jlc3MpIHsgcmV0dXJuOyB9XG5cblx0XHR0aGlzLl9zdGVwKCk7XG5cdFx0dGhpcy5fY29tcGxldGUoKTtcblx0fSxcblxuXHRfYW5pbWF0ZTogZnVuY3Rpb24gKCkge1xuXHRcdC8vIGFuaW1hdGlvbiBsb29wXG5cdFx0dGhpcy5fYW5pbUlkID0gTC5VdGlsLnJlcXVlc3RBbmltRnJhbWUodGhpcy5fYW5pbWF0ZSwgdGhpcyk7XG5cdFx0dGhpcy5fc3RlcCgpO1xuXHR9LFxuXG5cdF9zdGVwOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGVsYXBzZWQgPSAoK25ldyBEYXRlKCkpIC0gdGhpcy5fc3RhcnRUaW1lLFxuXHRcdCAgICBkdXJhdGlvbiA9IHRoaXMuX2R1cmF0aW9uICogMTAwMDtcblxuXHRcdGlmIChlbGFwc2VkIDwgZHVyYXRpb24pIHtcblx0XHRcdHRoaXMuX3J1bkZyYW1lKHRoaXMuX2Vhc2VPdXQoZWxhcHNlZCAvIGR1cmF0aW9uKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3J1bkZyYW1lKDEpO1xuXHRcdFx0dGhpcy5fY29tcGxldGUoKTtcblx0XHR9XG5cdH0sXG5cblx0X3J1bkZyYW1lOiBmdW5jdGlvbiAocHJvZ3Jlc3MpIHtcblx0XHR2YXIgcG9zID0gdGhpcy5fc3RhcnRQb3MuYWRkKHRoaXMuX29mZnNldC5tdWx0aXBseUJ5KHByb2dyZXNzKSk7XG5cdFx0TC5Eb21VdGlsLnNldFBvc2l0aW9uKHRoaXMuX2VsLCBwb3MpO1xuXG5cdFx0dGhpcy5maXJlKCdzdGVwJyk7XG5cdH0sXG5cblx0X2NvbXBsZXRlOiBmdW5jdGlvbiAoKSB7XG5cdFx0TC5VdGlsLmNhbmNlbEFuaW1GcmFtZSh0aGlzLl9hbmltSWQpO1xuXG5cdFx0dGhpcy5faW5Qcm9ncmVzcyA9IGZhbHNlO1xuXHRcdHRoaXMuZmlyZSgnZW5kJyk7XG5cdH0sXG5cblx0X2Vhc2VPdXQ6IGZ1bmN0aW9uICh0KSB7XG5cdFx0cmV0dXJuIDEgLSBNYXRoLnBvdygxIC0gdCwgdGhpcy5fZWFzZU91dFBvd2VyKTtcblx0fVxufSk7XG5cblxuLypcbiAqIEV4dGVuZHMgTC5NYXAgdG8gaGFuZGxlIHpvb20gYW5pbWF0aW9ucy5cbiAqL1xuXG5MLk1hcC5tZXJnZU9wdGlvbnMoe1xuXHR6b29tQW5pbWF0aW9uOiB0cnVlLFxuXHR6b29tQW5pbWF0aW9uVGhyZXNob2xkOiA0XG59KTtcblxuaWYgKEwuRG9tVXRpbC5UUkFOU0lUSU9OKSB7XG5cblx0TC5NYXAuYWRkSW5pdEhvb2soZnVuY3Rpb24gKCkge1xuXHRcdC8vIGRvbid0IGFuaW1hdGUgb24gYnJvd3NlcnMgd2l0aG91dCBoYXJkd2FyZS1hY2NlbGVyYXRlZCB0cmFuc2l0aW9ucyBvciBvbGQgQW5kcm9pZC9PcGVyYVxuXHRcdHRoaXMuX3pvb21BbmltYXRlZCA9IHRoaXMub3B0aW9ucy56b29tQW5pbWF0aW9uICYmIEwuRG9tVXRpbC5UUkFOU0lUSU9OICYmXG5cdFx0XHRcdEwuQnJvd3Nlci5hbnkzZCAmJiAhTC5Ccm93c2VyLmFuZHJvaWQyMyAmJiAhTC5Ccm93c2VyLm1vYmlsZU9wZXJhO1xuXG5cdFx0Ly8gem9vbSB0cmFuc2l0aW9ucyBydW4gd2l0aCB0aGUgc2FtZSBkdXJhdGlvbiBmb3IgYWxsIGxheWVycywgc28gaWYgb25lIG9mIHRyYW5zaXRpb25lbmQgZXZlbnRzXG5cdFx0Ly8gaGFwcGVucyBhZnRlciBzdGFydGluZyB6b29tIGFuaW1hdGlvbiAocHJvcGFnYXRpbmcgdG8gdGhlIG1hcCBwYW5lKSwgd2Uga25vdyB0aGF0IGl0IGVuZGVkIGdsb2JhbGx5XG5cdFx0aWYgKHRoaXMuX3pvb21BbmltYXRlZCkge1xuXHRcdFx0TC5Eb21FdmVudC5vbih0aGlzLl9tYXBQYW5lLCBMLkRvbVV0aWwuVFJBTlNJVElPTl9FTkQsIHRoaXMuX2NhdGNoVHJhbnNpdGlvbkVuZCwgdGhpcyk7XG5cdFx0fVxuXHR9KTtcbn1cblxuTC5NYXAuaW5jbHVkZSghTC5Eb21VdGlsLlRSQU5TSVRJT04gPyB7fSA6IHtcblxuXHRfY2F0Y2hUcmFuc2l0aW9uRW5kOiBmdW5jdGlvbiAoZSkge1xuXHRcdGlmICh0aGlzLl9hbmltYXRpbmdab29tICYmIGUucHJvcGVydHlOYW1lLmluZGV4T2YoJ3RyYW5zZm9ybScpID49IDApIHtcblx0XHRcdHRoaXMuX29uWm9vbVRyYW5zaXRpb25FbmQoKTtcblx0XHR9XG5cdH0sXG5cblx0X25vdGhpbmdUb0FuaW1hdGU6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gIXRoaXMuX2NvbnRhaW5lci5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdsZWFmbGV0LXpvb20tYW5pbWF0ZWQnKS5sZW5ndGg7XG5cdH0sXG5cblx0X3RyeUFuaW1hdGVkWm9vbTogZnVuY3Rpb24gKGNlbnRlciwgem9vbSwgb3B0aW9ucykge1xuXG5cdFx0aWYgKHRoaXMuX2FuaW1hdGluZ1pvb20pIHsgcmV0dXJuIHRydWU7IH1cblxuXHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdFx0Ly8gZG9uJ3QgYW5pbWF0ZSBpZiBkaXNhYmxlZCwgbm90IHN1cHBvcnRlZCBvciB6b29tIGRpZmZlcmVuY2UgaXMgdG9vIGxhcmdlXG5cdFx0aWYgKCF0aGlzLl96b29tQW5pbWF0ZWQgfHwgb3B0aW9ucy5hbmltYXRlID09PSBmYWxzZSB8fCB0aGlzLl9ub3RoaW5nVG9BbmltYXRlKCkgfHxcblx0XHQgICAgICAgIE1hdGguYWJzKHpvb20gLSB0aGlzLl96b29tKSA+IHRoaXMub3B0aW9ucy56b29tQW5pbWF0aW9uVGhyZXNob2xkKSB7IHJldHVybiBmYWxzZTsgfVxuXG5cdFx0Ly8gb2Zmc2V0IGlzIHRoZSBwaXhlbCBjb29yZHMgb2YgdGhlIHpvb20gb3JpZ2luIHJlbGF0aXZlIHRvIHRoZSBjdXJyZW50IGNlbnRlclxuXHRcdHZhciBzY2FsZSA9IHRoaXMuZ2V0Wm9vbVNjYWxlKHpvb20pLFxuXHRcdCAgICBvZmZzZXQgPSB0aGlzLl9nZXRDZW50ZXJPZmZzZXQoY2VudGVyKS5fZGl2aWRlQnkoMSAtIDEgLyBzY2FsZSksXG5cdFx0XHRvcmlnaW4gPSB0aGlzLl9nZXRDZW50ZXJMYXllclBvaW50KCkuX2FkZChvZmZzZXQpO1xuXG5cdFx0Ly8gZG9uJ3QgYW5pbWF0ZSBpZiB0aGUgem9vbSBvcmlnaW4gaXNuJ3Qgd2l0aGluIG9uZSBzY3JlZW4gZnJvbSB0aGUgY3VycmVudCBjZW50ZXIsIHVubGVzcyBmb3JjZWRcblx0XHRpZiAob3B0aW9ucy5hbmltYXRlICE9PSB0cnVlICYmICF0aGlzLmdldFNpemUoKS5jb250YWlucyhvZmZzZXQpKSB7IHJldHVybiBmYWxzZTsgfVxuXG5cdFx0dGhpc1xuXHRcdCAgICAuZmlyZSgnbW92ZXN0YXJ0Jylcblx0XHQgICAgLmZpcmUoJ3pvb21zdGFydCcpO1xuXG5cdFx0dGhpcy5fYW5pbWF0ZVpvb20oY2VudGVyLCB6b29tLCBvcmlnaW4sIHNjYWxlLCBudWxsLCB0cnVlKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9LFxuXG5cdF9hbmltYXRlWm9vbTogZnVuY3Rpb24gKGNlbnRlciwgem9vbSwgb3JpZ2luLCBzY2FsZSwgZGVsdGEsIGJhY2t3YXJkcywgZm9yVG91Y2hab29tKSB7XG5cblx0XHRpZiAoIWZvclRvdWNoWm9vbSkge1xuXHRcdFx0dGhpcy5fYW5pbWF0aW5nWm9vbSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gcHV0IHRyYW5zZm9ybSB0cmFuc2l0aW9uIG9uIGFsbCBsYXllcnMgd2l0aCBsZWFmbGV0LXpvb20tYW5pbWF0ZWQgY2xhc3Ncblx0XHRMLkRvbVV0aWwuYWRkQ2xhc3ModGhpcy5fbWFwUGFuZSwgJ2xlYWZsZXQtem9vbS1hbmltJyk7XG5cblx0XHQvLyByZW1lbWJlciB3aGF0IGNlbnRlci96b29tIHRvIHNldCBhZnRlciBhbmltYXRpb25cblx0XHR0aGlzLl9hbmltYXRlVG9DZW50ZXIgPSBjZW50ZXI7XG5cdFx0dGhpcy5fYW5pbWF0ZVRvWm9vbSA9IHpvb207XG5cblx0XHQvLyBkaXNhYmxlIGFueSBkcmFnZ2luZyBkdXJpbmcgYW5pbWF0aW9uXG5cdFx0aWYgKEwuRHJhZ2dhYmxlKSB7XG5cdFx0XHRMLkRyYWdnYWJsZS5fZGlzYWJsZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdEwuVXRpbC5yZXF1ZXN0QW5pbUZyYW1lKGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMuZmlyZSgnem9vbWFuaW0nLCB7XG5cdFx0XHRcdGNlbnRlcjogY2VudGVyLFxuXHRcdFx0XHR6b29tOiB6b29tLFxuXHRcdFx0XHRvcmlnaW46IG9yaWdpbixcblx0XHRcdFx0c2NhbGU6IHNjYWxlLFxuXHRcdFx0XHRkZWx0YTogZGVsdGEsXG5cdFx0XHRcdGJhY2t3YXJkczogYmFja3dhcmRzXG5cdFx0XHR9KTtcblx0XHR9LCB0aGlzKTtcblx0fSxcblxuXHRfb25ab29tVHJhbnNpdGlvbkVuZDogZnVuY3Rpb24gKCkge1xuXG5cdFx0dGhpcy5fYW5pbWF0aW5nWm9vbSA9IGZhbHNlO1xuXG5cdFx0TC5Eb21VdGlsLnJlbW92ZUNsYXNzKHRoaXMuX21hcFBhbmUsICdsZWFmbGV0LXpvb20tYW5pbScpO1xuXG5cdFx0dGhpcy5fcmVzZXRWaWV3KHRoaXMuX2FuaW1hdGVUb0NlbnRlciwgdGhpcy5fYW5pbWF0ZVRvWm9vbSwgdHJ1ZSwgdHJ1ZSk7XG5cblx0XHRpZiAoTC5EcmFnZ2FibGUpIHtcblx0XHRcdEwuRHJhZ2dhYmxlLl9kaXNhYmxlZCA9IGZhbHNlO1xuXHRcdH1cblx0fVxufSk7XG5cblxuLypcblx0Wm9vbSBhbmltYXRpb24gbG9naWMgZm9yIEwuVGlsZUxheWVyLlxuKi9cblxuTC5UaWxlTGF5ZXIuaW5jbHVkZSh7XG5cdF9hbmltYXRlWm9vbTogZnVuY3Rpb24gKGUpIHtcblx0XHRpZiAoIXRoaXMuX2FuaW1hdGluZykge1xuXHRcdFx0dGhpcy5fYW5pbWF0aW5nID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3ByZXBhcmVCZ0J1ZmZlcigpO1xuXHRcdH1cblxuXHRcdHZhciBiZyA9IHRoaXMuX2JnQnVmZmVyLFxuXHRcdCAgICB0cmFuc2Zvcm0gPSBMLkRvbVV0aWwuVFJBTlNGT1JNLFxuXHRcdCAgICBpbml0aWFsVHJhbnNmb3JtID0gZS5kZWx0YSA/IEwuRG9tVXRpbC5nZXRUcmFuc2xhdGVTdHJpbmcoZS5kZWx0YSkgOiBiZy5zdHlsZVt0cmFuc2Zvcm1dLFxuXHRcdCAgICBzY2FsZVN0ciA9IEwuRG9tVXRpbC5nZXRTY2FsZVN0cmluZyhlLnNjYWxlLCBlLm9yaWdpbik7XG5cblx0XHRiZy5zdHlsZVt0cmFuc2Zvcm1dID0gZS5iYWNrd2FyZHMgP1xuXHRcdFx0XHRzY2FsZVN0ciArICcgJyArIGluaXRpYWxUcmFuc2Zvcm0gOlxuXHRcdFx0XHRpbml0aWFsVHJhbnNmb3JtICsgJyAnICsgc2NhbGVTdHI7XG5cdH0sXG5cblx0X2VuZFpvb21BbmltOiBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGZyb250ID0gdGhpcy5fdGlsZUNvbnRhaW5lcixcblx0XHQgICAgYmcgPSB0aGlzLl9iZ0J1ZmZlcjtcblxuXHRcdGZyb250LnN0eWxlLnZpc2liaWxpdHkgPSAnJztcblx0XHRmcm9udC5wYXJlbnROb2RlLmFwcGVuZENoaWxkKGZyb250KTsgLy8gQnJpbmcgdG8gZm9yZVxuXG5cdFx0Ly8gZm9yY2UgcmVmbG93XG5cdFx0TC5VdGlsLmZhbHNlRm4oYmcub2Zmc2V0V2lkdGgpO1xuXG5cdFx0dGhpcy5fYW5pbWF0aW5nID0gZmFsc2U7XG5cdH0sXG5cblx0X2NsZWFyQmdCdWZmZXI6IGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgbWFwID0gdGhpcy5fbWFwO1xuXG5cdFx0aWYgKG1hcCAmJiAhbWFwLl9hbmltYXRpbmdab29tICYmICFtYXAudG91Y2hab29tLl96b29taW5nKSB7XG5cdFx0XHR0aGlzLl9iZ0J1ZmZlci5pbm5lckhUTUwgPSAnJztcblx0XHRcdHRoaXMuX2JnQnVmZmVyLnN0eWxlW0wuRG9tVXRpbC5UUkFOU0ZPUk1dID0gJyc7XG5cdFx0fVxuXHR9LFxuXG5cdF9wcmVwYXJlQmdCdWZmZXI6IGZ1bmN0aW9uICgpIHtcblxuXHRcdHZhciBmcm9udCA9IHRoaXMuX3RpbGVDb250YWluZXIsXG5cdFx0ICAgIGJnID0gdGhpcy5fYmdCdWZmZXI7XG5cblx0XHQvLyBpZiBmb3JlZ3JvdW5kIGxheWVyIGRvZXNuJ3QgaGF2ZSBtYW55IHRpbGVzIGJ1dCBiZyBsYXllciBkb2VzLFxuXHRcdC8vIGtlZXAgdGhlIGV4aXN0aW5nIGJnIGxheWVyIGFuZCBqdXN0IHpvb20gaXQgc29tZSBtb3JlXG5cblx0XHR2YXIgYmdMb2FkZWQgPSB0aGlzLl9nZXRMb2FkZWRUaWxlc1BlcmNlbnRhZ2UoYmcpLFxuXHRcdCAgICBmcm9udExvYWRlZCA9IHRoaXMuX2dldExvYWRlZFRpbGVzUGVyY2VudGFnZShmcm9udCk7XG5cblx0XHRpZiAoYmcgJiYgYmdMb2FkZWQgPiAwLjUgJiYgZnJvbnRMb2FkZWQgPCAwLjUpIHtcblxuXHRcdFx0ZnJvbnQuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xuXHRcdFx0dGhpcy5fc3RvcExvYWRpbmdJbWFnZXMoZnJvbnQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHByZXBhcmUgdGhlIGJ1ZmZlciB0byBiZWNvbWUgdGhlIGZyb250IHRpbGUgcGFuZVxuXHRcdGJnLnN0eWxlLnZpc2liaWxpdHkgPSAnaGlkZGVuJztcblx0XHRiZy5zdHlsZVtMLkRvbVV0aWwuVFJBTlNGT1JNXSA9ICcnO1xuXG5cdFx0Ly8gc3dpdGNoIG91dCB0aGUgY3VycmVudCBsYXllciB0byBiZSB0aGUgbmV3IGJnIGxheWVyIChhbmQgdmljZS12ZXJzYSlcblx0XHR0aGlzLl90aWxlQ29udGFpbmVyID0gYmc7XG5cdFx0YmcgPSB0aGlzLl9iZ0J1ZmZlciA9IGZyb250O1xuXG5cdFx0dGhpcy5fc3RvcExvYWRpbmdJbWFnZXMoYmcpO1xuXG5cdFx0Ly9wcmV2ZW50IGJnIGJ1ZmZlciBmcm9tIGNsZWFyaW5nIHJpZ2h0IGFmdGVyIHpvb21cblx0XHRjbGVhclRpbWVvdXQodGhpcy5fY2xlYXJCZ0J1ZmZlclRpbWVyKTtcblx0fSxcblxuXHRfZ2V0TG9hZGVkVGlsZXNQZXJjZW50YWdlOiBmdW5jdGlvbiAoY29udGFpbmVyKSB7XG5cdFx0dmFyIHRpbGVzID0gY29udGFpbmVyLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdpbWcnKSxcblx0XHQgICAgaSwgbGVuLCBjb3VudCA9IDA7XG5cblx0XHRmb3IgKGkgPSAwLCBsZW4gPSB0aWxlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKHRpbGVzW2ldLmNvbXBsZXRlKSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb3VudCAvIGxlbjtcblx0fSxcblxuXHQvLyBzdG9wcyBsb2FkaW5nIGFsbCB0aWxlcyBpbiB0aGUgYmFja2dyb3VuZCBsYXllclxuXHRfc3RvcExvYWRpbmdJbWFnZXM6IGZ1bmN0aW9uIChjb250YWluZXIpIHtcblx0XHR2YXIgdGlsZXMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChjb250YWluZXIuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2ltZycpKSxcblx0XHQgICAgaSwgbGVuLCB0aWxlO1xuXG5cdFx0Zm9yIChpID0gMCwgbGVuID0gdGlsZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdHRpbGUgPSB0aWxlc1tpXTtcblxuXHRcdFx0aWYgKCF0aWxlLmNvbXBsZXRlKSB7XG5cdFx0XHRcdHRpbGUub25sb2FkID0gTC5VdGlsLmZhbHNlRm47XG5cdFx0XHRcdHRpbGUub25lcnJvciA9IEwuVXRpbC5mYWxzZUZuO1xuXHRcdFx0XHR0aWxlLnNyYyA9IEwuVXRpbC5lbXB0eUltYWdlVXJsO1xuXG5cdFx0XHRcdHRpbGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aWxlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5cbi8qXHJcbiAqIFByb3ZpZGVzIEwuTWFwIHdpdGggY29udmVuaWVudCBzaG9ydGN1dHMgZm9yIHVzaW5nIGJyb3dzZXIgZ2VvbG9jYXRpb24gZmVhdHVyZXMuXHJcbiAqL1xyXG5cclxuTC5NYXAuaW5jbHVkZSh7XHJcblx0X2RlZmF1bHRMb2NhdGVPcHRpb25zOiB7XHJcblx0XHR3YXRjaDogZmFsc2UsXHJcblx0XHRzZXRWaWV3OiBmYWxzZSxcclxuXHRcdG1heFpvb206IEluZmluaXR5LFxyXG5cdFx0dGltZW91dDogMTAwMDAsXHJcblx0XHRtYXhpbXVtQWdlOiAwLFxyXG5cdFx0ZW5hYmxlSGlnaEFjY3VyYWN5OiBmYWxzZVxyXG5cdH0sXHJcblxyXG5cdGxvY2F0ZTogZnVuY3Rpb24gKC8qT2JqZWN0Ki8gb3B0aW9ucykge1xyXG5cclxuXHRcdG9wdGlvbnMgPSB0aGlzLl9sb2NhdGVPcHRpb25zID0gTC5leHRlbmQodGhpcy5fZGVmYXVsdExvY2F0ZU9wdGlvbnMsIG9wdGlvbnMpO1xyXG5cclxuXHRcdGlmICghbmF2aWdhdG9yLmdlb2xvY2F0aW9uKSB7XHJcblx0XHRcdHRoaXMuX2hhbmRsZUdlb2xvY2F0aW9uRXJyb3Ioe1xyXG5cdFx0XHRcdGNvZGU6IDAsXHJcblx0XHRcdFx0bWVzc2FnZTogJ0dlb2xvY2F0aW9uIG5vdCBzdXBwb3J0ZWQuJ1xyXG5cdFx0XHR9KTtcclxuXHRcdFx0cmV0dXJuIHRoaXM7XHJcblx0XHR9XHJcblxyXG5cdFx0dmFyIG9uUmVzcG9uc2UgPSBMLmJpbmQodGhpcy5faGFuZGxlR2VvbG9jYXRpb25SZXNwb25zZSwgdGhpcyksXHJcblx0XHRcdG9uRXJyb3IgPSBMLmJpbmQodGhpcy5faGFuZGxlR2VvbG9jYXRpb25FcnJvciwgdGhpcyk7XHJcblxyXG5cdFx0aWYgKG9wdGlvbnMud2F0Y2gpIHtcclxuXHRcdFx0dGhpcy5fbG9jYXRpb25XYXRjaElkID1cclxuXHRcdFx0ICAgICAgICBuYXZpZ2F0b3IuZ2VvbG9jYXRpb24ud2F0Y2hQb3NpdGlvbihvblJlc3BvbnNlLCBvbkVycm9yLCBvcHRpb25zKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdG5hdmlnYXRvci5nZW9sb2NhdGlvbi5nZXRDdXJyZW50UG9zaXRpb24ob25SZXNwb25zZSwgb25FcnJvciwgb3B0aW9ucyk7XHJcblx0XHR9XHJcblx0XHRyZXR1cm4gdGhpcztcclxuXHR9LFxyXG5cclxuXHRzdG9wTG9jYXRlOiBmdW5jdGlvbiAoKSB7XHJcblx0XHRpZiAobmF2aWdhdG9yLmdlb2xvY2F0aW9uKSB7XHJcblx0XHRcdG5hdmlnYXRvci5nZW9sb2NhdGlvbi5jbGVhcldhdGNoKHRoaXMuX2xvY2F0aW9uV2F0Y2hJZCk7XHJcblx0XHR9XHJcblx0XHRpZiAodGhpcy5fbG9jYXRlT3B0aW9ucykge1xyXG5cdFx0XHR0aGlzLl9sb2NhdGVPcHRpb25zLnNldFZpZXcgPSBmYWxzZTtcclxuXHRcdH1cclxuXHRcdHJldHVybiB0aGlzO1xyXG5cdH0sXHJcblxyXG5cdF9oYW5kbGVHZW9sb2NhdGlvbkVycm9yOiBmdW5jdGlvbiAoZXJyb3IpIHtcclxuXHRcdHZhciBjID0gZXJyb3IuY29kZSxcclxuXHRcdCAgICBtZXNzYWdlID0gZXJyb3IubWVzc2FnZSB8fFxyXG5cdFx0ICAgICAgICAgICAgKGMgPT09IDEgPyAncGVybWlzc2lvbiBkZW5pZWQnIDpcclxuXHRcdCAgICAgICAgICAgIChjID09PSAyID8gJ3Bvc2l0aW9uIHVuYXZhaWxhYmxlJyA6ICd0aW1lb3V0JykpO1xyXG5cclxuXHRcdGlmICh0aGlzLl9sb2NhdGVPcHRpb25zLnNldFZpZXcgJiYgIXRoaXMuX2xvYWRlZCkge1xyXG5cdFx0XHR0aGlzLmZpdFdvcmxkKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5maXJlKCdsb2NhdGlvbmVycm9yJywge1xyXG5cdFx0XHRjb2RlOiBjLFxyXG5cdFx0XHRtZXNzYWdlOiAnR2VvbG9jYXRpb24gZXJyb3I6ICcgKyBtZXNzYWdlICsgJy4nXHJcblx0XHR9KTtcclxuXHR9LFxyXG5cclxuXHRfaGFuZGxlR2VvbG9jYXRpb25SZXNwb25zZTogZnVuY3Rpb24gKHBvcykge1xyXG5cdFx0dmFyIGxhdCA9IHBvcy5jb29yZHMubGF0aXR1ZGUsXHJcblx0XHQgICAgbG5nID0gcG9zLmNvb3Jkcy5sb25naXR1ZGUsXHJcblx0XHQgICAgbGF0bG5nID0gbmV3IEwuTGF0TG5nKGxhdCwgbG5nKSxcclxuXHJcblx0XHQgICAgbGF0QWNjdXJhY3kgPSAxODAgKiBwb3MuY29vcmRzLmFjY3VyYWN5IC8gNDAwNzUwMTcsXHJcblx0XHQgICAgbG5nQWNjdXJhY3kgPSBsYXRBY2N1cmFjeSAvIE1hdGguY29zKEwuTGF0TG5nLkRFR19UT19SQUQgKiBsYXQpLFxyXG5cclxuXHRcdCAgICBib3VuZHMgPSBMLmxhdExuZ0JvdW5kcyhcclxuXHRcdCAgICAgICAgICAgIFtsYXQgLSBsYXRBY2N1cmFjeSwgbG5nIC0gbG5nQWNjdXJhY3ldLFxyXG5cdFx0ICAgICAgICAgICAgW2xhdCArIGxhdEFjY3VyYWN5LCBsbmcgKyBsbmdBY2N1cmFjeV0pLFxyXG5cclxuXHRcdCAgICBvcHRpb25zID0gdGhpcy5fbG9jYXRlT3B0aW9ucztcclxuXHJcblx0XHRpZiAob3B0aW9ucy5zZXRWaWV3KSB7XHJcblx0XHRcdHZhciB6b29tID0gTWF0aC5taW4odGhpcy5nZXRCb3VuZHNab29tKGJvdW5kcyksIG9wdGlvbnMubWF4Wm9vbSk7XHJcblx0XHRcdHRoaXMuc2V0VmlldyhsYXRsbmcsIHpvb20pO1xyXG5cdFx0fVxyXG5cclxuXHRcdHZhciBkYXRhID0ge1xyXG5cdFx0XHRsYXRsbmc6IGxhdGxuZyxcclxuXHRcdFx0Ym91bmRzOiBib3VuZHMsXHJcblx0XHRcdHRpbWVzdGFtcDogcG9zLnRpbWVzdGFtcFxyXG5cdFx0fTtcclxuXHJcblx0XHRmb3IgKHZhciBpIGluIHBvcy5jb29yZHMpIHtcclxuXHRcdFx0aWYgKHR5cGVvZiBwb3MuY29vcmRzW2ldID09PSAnbnVtYmVyJykge1xyXG5cdFx0XHRcdGRhdGFbaV0gPSBwb3MuY29vcmRzW2ldO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5maXJlKCdsb2NhdGlvbmZvdW5kJywgZGF0YSk7XHJcblx0fVxyXG59KTtcclxuXG5cbn0od2luZG93LCBkb2N1bWVudCkpOyIsInZhciBwb2x5bGluZSA9IHt9O1xuXG4vLyBCYXNlZCBvZmYgb2YgW3RoZSBvZmZpY2FsIEdvb2dsZSBkb2N1bWVudF0oaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vbWFwcy9kb2N1bWVudGF0aW9uL3V0aWxpdGllcy9wb2x5bGluZWFsZ29yaXRobSlcbi8vXG4vLyBTb21lIHBhcnRzIGZyb20gW3RoaXMgaW1wbGVtZW50YXRpb25dKGh0dHA6Ly9mYWNzdGFmZi51bmNhLmVkdS9tY21jY2x1ci9Hb29nbGVNYXBzL0VuY29kZVBvbHlsaW5lL1BvbHlsaW5lRW5jb2Rlci5qcylcbi8vIGJ5IFtNYXJrIE1jQ2x1cmVdKGh0dHA6Ly9mYWNzdGFmZi51bmNhLmVkdS9tY21jY2x1ci8pXG5cbmZ1bmN0aW9uIGVuY29kZShjb29yZGluYXRlLCBmYWN0b3IpIHtcbiAgICBjb29yZGluYXRlID0gTWF0aC5yb3VuZChjb29yZGluYXRlICogZmFjdG9yKTtcbiAgICBjb29yZGluYXRlIDw8PSAxO1xuICAgIGlmIChjb29yZGluYXRlIDwgMCkge1xuICAgICAgICBjb29yZGluYXRlID0gfmNvb3JkaW5hdGU7XG4gICAgfVxuICAgIHZhciBvdXRwdXQgPSAnJztcbiAgICB3aGlsZSAoY29vcmRpbmF0ZSA+PSAweDIwKSB7XG4gICAgICAgIG91dHB1dCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKCgweDIwIHwgKGNvb3JkaW5hdGUgJiAweDFmKSkgKyA2Myk7XG4gICAgICAgIGNvb3JkaW5hdGUgPj49IDU7XG4gICAgfVxuICAgIG91dHB1dCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNvb3JkaW5hdGUgKyA2Myk7XG4gICAgcmV0dXJuIG91dHB1dDtcbn1cblxuLy8gVGhpcyBpcyBhZGFwdGVkIGZyb20gdGhlIGltcGxlbWVudGF0aW9uIGluIFByb2plY3QtT1NSTVxuLy8gaHR0cHM6Ly9naXRodWIuY29tL0Rlbm5pc09TUk0vUHJvamVjdC1PU1JNLVdlYi9ibG9iL21hc3Rlci9XZWJDb250ZW50L3JvdXRpbmcvT1NSTS5Sb3V0aW5nR2VvbWV0cnkuanNcbnBvbHlsaW5lLmRlY29kZSA9IGZ1bmN0aW9uKHN0ciwgcHJlY2lzaW9uKSB7XG4gICAgdmFyIGluZGV4ID0gMCxcbiAgICAgICAgbGF0ID0gMCxcbiAgICAgICAgbG5nID0gMCxcbiAgICAgICAgY29vcmRpbmF0ZXMgPSBbXSxcbiAgICAgICAgc2hpZnQgPSAwLFxuICAgICAgICByZXN1bHQgPSAwLFxuICAgICAgICBieXRlID0gbnVsbCxcbiAgICAgICAgbGF0aXR1ZGVfY2hhbmdlLFxuICAgICAgICBsb25naXR1ZGVfY2hhbmdlLFxuICAgICAgICBmYWN0b3IgPSBNYXRoLnBvdygxMCwgcHJlY2lzaW9uIHx8IDUpO1xuXG4gICAgLy8gQ29vcmRpbmF0ZXMgaGF2ZSB2YXJpYWJsZSBsZW5ndGggd2hlbiBlbmNvZGVkLCBzbyBqdXN0IGtlZXBcbiAgICAvLyB0cmFjayBvZiB3aGV0aGVyIHdlJ3ZlIGhpdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcuIEluIGVhY2hcbiAgICAvLyBsb29wIGl0ZXJhdGlvbiwgYSBzaW5nbGUgY29vcmRpbmF0ZSBpcyBkZWNvZGVkLlxuICAgIHdoaWxlIChpbmRleCA8IHN0ci5sZW5ndGgpIHtcblxuICAgICAgICAvLyBSZXNldCBzaGlmdCwgcmVzdWx0LCBhbmQgYnl0ZVxuICAgICAgICBieXRlID0gbnVsbDtcbiAgICAgICAgc2hpZnQgPSAwO1xuICAgICAgICByZXN1bHQgPSAwO1xuXG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIGJ5dGUgPSBzdHIuY2hhckNvZGVBdChpbmRleCsrKSAtIDYzO1xuICAgICAgICAgICAgcmVzdWx0IHw9IChieXRlICYgMHgxZikgPDwgc2hpZnQ7XG4gICAgICAgICAgICBzaGlmdCArPSA1O1xuICAgICAgICB9IHdoaWxlIChieXRlID49IDB4MjApO1xuXG4gICAgICAgIGxhdGl0dWRlX2NoYW5nZSA9ICgocmVzdWx0ICYgMSkgPyB+KHJlc3VsdCA+PiAxKSA6IChyZXN1bHQgPj4gMSkpO1xuXG4gICAgICAgIHNoaWZ0ID0gcmVzdWx0ID0gMDtcblxuICAgICAgICBkbyB7XG4gICAgICAgICAgICBieXRlID0gc3RyLmNoYXJDb2RlQXQoaW5kZXgrKykgLSA2MztcbiAgICAgICAgICAgIHJlc3VsdCB8PSAoYnl0ZSAmIDB4MWYpIDw8IHNoaWZ0O1xuICAgICAgICAgICAgc2hpZnQgKz0gNTtcbiAgICAgICAgfSB3aGlsZSAoYnl0ZSA+PSAweDIwKTtcblxuICAgICAgICBsb25naXR1ZGVfY2hhbmdlID0gKChyZXN1bHQgJiAxKSA/IH4ocmVzdWx0ID4+IDEpIDogKHJlc3VsdCA+PiAxKSk7XG5cbiAgICAgICAgbGF0ICs9IGxhdGl0dWRlX2NoYW5nZTtcbiAgICAgICAgbG5nICs9IGxvbmdpdHVkZV9jaGFuZ2U7XG5cbiAgICAgICAgY29vcmRpbmF0ZXMucHVzaChbbGF0IC8gZmFjdG9yLCBsbmcgLyBmYWN0b3JdKTtcbiAgICB9XG5cbiAgICByZXR1cm4gY29vcmRpbmF0ZXM7XG59O1xuXG5wb2x5bGluZS5lbmNvZGUgPSBmdW5jdGlvbihjb29yZGluYXRlcywgcHJlY2lzaW9uKSB7XG4gICAgaWYgKCFjb29yZGluYXRlcy5sZW5ndGgpIHJldHVybiAnJztcblxuICAgIHZhciBmYWN0b3IgPSBNYXRoLnBvdygxMCwgcHJlY2lzaW9uIHx8IDUpLFxuICAgICAgICBvdXRwdXQgPSBlbmNvZGUoY29vcmRpbmF0ZXNbMF1bMF0sIGZhY3RvcikgKyBlbmNvZGUoY29vcmRpbmF0ZXNbMF1bMV0sIGZhY3Rvcik7XG5cbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IGNvb3JkaW5hdGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBhID0gY29vcmRpbmF0ZXNbaV0sIGIgPSBjb29yZGluYXRlc1tpIC0gMV07XG4gICAgICAgIG91dHB1dCArPSBlbmNvZGUoYVswXSAtIGJbMF0sIGZhY3Rvcik7XG4gICAgICAgIG91dHB1dCArPSBlbmNvZGUoYVsxXSAtIGJbMV0sIGZhY3Rvcik7XG4gICAgfVxuXG4gICAgcmV0dXJuIG91dHB1dDtcbn07XG5cbmlmICh0eXBlb2YgbW9kdWxlICE9PSB1bmRlZmluZWQpIG1vZHVsZS5leHBvcnRzID0gcG9seWxpbmU7XG4iLCIoZnVuY3Rpb24oKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuXHRMLlJvdXRpbmcgPSBMLlJvdXRpbmcgfHwge307XG5cblx0TC5Sb3V0aW5nLkF1dG9jb21wbGV0ZSA9IEwuQ2xhc3MuZXh0ZW5kKHtcblx0XHRvcHRpb25zOiB7XG5cdFx0XHR0aW1lb3V0OiA1MDAsXG5cdFx0XHRibHVyVGltZW91dDogMTAwLFxuXHRcdFx0bm9SZXN1bHRzTWVzc2FnZTogJ05vIHJlc3VsdHMgZm91bmQuJ1xuXHRcdH0sXG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbihlbGVtLCBjYWxsYmFjaywgY29udGV4dCwgb3B0aW9ucykge1xuXHRcdFx0TC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xuXG5cdFx0XHR0aGlzLl9lbGVtID0gZWxlbTtcblx0XHRcdHRoaXMuX3Jlc3VsdEZuID0gb3B0aW9ucy5yZXN1bHRGbiA/IEwuVXRpbC5iaW5kKG9wdGlvbnMucmVzdWx0Rm4sIG9wdGlvbnMucmVzdWx0Q29udGV4dCkgOiBudWxsO1xuXHRcdFx0dGhpcy5fYXV0b2NvbXBsZXRlID0gb3B0aW9ucy5hdXRvY29tcGxldGVGbiA/IEwuVXRpbC5iaW5kKG9wdGlvbnMuYXV0b2NvbXBsZXRlRm4sIG9wdGlvbnMuYXV0b2NvbXBsZXRlQ29udGV4dCkgOiBudWxsO1xuXHRcdFx0dGhpcy5fc2VsZWN0Rm4gPSBMLlV0aWwuYmluZChjYWxsYmFjaywgY29udGV4dCk7XG5cdFx0XHR0aGlzLl9jb250YWluZXIgPSBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCAnbGVhZmxldC1yb3V0aW5nLWdlb2NvZGVyLXJlc3VsdCcpO1xuXHRcdFx0dGhpcy5fcmVzdWx0VGFibGUgPSBMLkRvbVV0aWwuY3JlYXRlKCd0YWJsZScsICcnLCB0aGlzLl9jb250YWluZXIpO1xuXG5cdFx0XHQvLyBUT0RPOiBsb29rcyBhIGJpdCBsaWtlIGEga2x1ZGdlIHRvIHJlZ2lzdGVyIHNhbWUgZm9yIGlucHV0IGFuZCBrZXlwcmVzcyAtXG5cdFx0XHQvLyBicm93c2VycyBzdXBwb3J0aW5nIGJvdGggd2lsbCBnZXQgZHVwbGljYXRlIGV2ZW50czsganVzdCByZWdpc3RlcmluZ1xuXHRcdFx0Ly8gaW5wdXQgd2lsbCBub3QgY2F0Y2ggZW50ZXIsIHRob3VnaC5cblx0XHRcdEwuRG9tRXZlbnQuYWRkTGlzdGVuZXIodGhpcy5fZWxlbSwgJ2lucHV0JywgdGhpcy5fa2V5UHJlc3NlZCwgdGhpcyk7XG5cdFx0XHRMLkRvbUV2ZW50LmFkZExpc3RlbmVyKHRoaXMuX2VsZW0sICdrZXlwcmVzcycsIHRoaXMuX2tleVByZXNzZWQsIHRoaXMpO1xuXHRcdFx0TC5Eb21FdmVudC5hZGRMaXN0ZW5lcih0aGlzLl9lbGVtLCAna2V5ZG93bicsIHRoaXMuX2tleURvd24sIHRoaXMpO1xuXHRcdFx0TC5Eb21FdmVudC5hZGRMaXN0ZW5lcih0aGlzLl9lbGVtLCAnYmx1cicsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRpZiAodGhpcy5faXNPcGVuKSB7XG5cdFx0XHRcdFx0dGhpcy5jbG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB0aGlzKTtcblx0XHR9LFxuXG5cdFx0Y2xvc2U6IGZ1bmN0aW9uKCkge1xuXHRcdFx0TC5Eb21VdGlsLnJlbW92ZUNsYXNzKHRoaXMuX2NvbnRhaW5lciwgJ2xlYWZsZXQtcm91dGluZy1nZW9jb2Rlci1yZXN1bHQtb3BlbicpO1xuXHRcdFx0dGhpcy5faXNPcGVuID0gZmFsc2U7XG5cdFx0fSxcblxuXHRcdF9vcGVuOiBmdW5jdGlvbigpIHtcblx0XHRcdHZhciByZWN0ID0gdGhpcy5fZWxlbS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdGlmICghdGhpcy5fY29udGFpbmVyLnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fY29udGFpbmVyLnN0eWxlLmxlZnQgPSAocmVjdC5sZWZ0ICsgd2luZG93LnNjcm9sbFgpICsgJ3B4Jztcblx0XHRcdFx0dGhpcy5fY29udGFpbmVyLnN0eWxlLnRvcCA9IChyZWN0LmJvdHRvbSArIHdpbmRvdy5zY3JvbGxZKSArICdweCc7XG5cdFx0XHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS53aWR0aCA9IChyZWN0LnJpZ2h0IC0gcmVjdC5sZWZ0KSArICdweCc7XG5cdFx0XHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5fY29udGFpbmVyKTtcblx0XHRcdH1cblxuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKHRoaXMuX2NvbnRhaW5lciwgJ2xlYWZsZXQtcm91dGluZy1nZW9jb2Rlci1yZXN1bHQtb3BlbicpO1xuXHRcdFx0dGhpcy5faXNPcGVuID0gdHJ1ZTtcblx0XHR9LFxuXG5cdFx0X3NldFJlc3VsdHM6IGZ1bmN0aW9uKHJlc3VsdHMpIHtcblx0XHRcdHZhciBpLFxuXHRcdFx0ICAgIHRyLFxuXHRcdFx0ICAgIHRkLFxuXHRcdFx0ICAgIHRleHQ7XG5cblx0XHRcdGRlbGV0ZSB0aGlzLl9zZWxlY3Rpb247XG5cdFx0XHR0aGlzLl9yZXN1bHRzID0gcmVzdWx0cztcblxuXHRcdFx0d2hpbGUgKHRoaXMuX3Jlc3VsdFRhYmxlLmZpcnN0Q2hpbGQpIHtcblx0XHRcdFx0dGhpcy5fcmVzdWx0VGFibGUucmVtb3ZlQ2hpbGQodGhpcy5fcmVzdWx0VGFibGUuZmlyc3RDaGlsZCk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoaSA9IDA7IGkgPCByZXN1bHRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHRyID0gTC5Eb21VdGlsLmNyZWF0ZSgndHInLCAnJywgdGhpcy5fcmVzdWx0VGFibGUpO1xuXHRcdFx0XHR0ci5zZXRBdHRyaWJ1dGUoJ2RhdGEtcmVzdWx0LWluZGV4JywgaSk7XG5cdFx0XHRcdHRkID0gTC5Eb21VdGlsLmNyZWF0ZSgndGQnLCAnJywgdHIpO1xuXHRcdFx0XHR0ZXh0ID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUocmVzdWx0c1tpXS5uYW1lKTtcblx0XHRcdFx0dGQuYXBwZW5kQ2hpbGQodGV4dCk7XG5cdFx0XHRcdC8vIG1vdXNlZG93biArIGNsaWNrIGJlY2F1c2U6XG5cdFx0XHRcdC8vIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMTA2NTI4NTIvanF1ZXJ5LWZpcmUtY2xpY2stYmVmb3JlLWJsdXItZXZlbnRcblx0XHRcdFx0TC5Eb21FdmVudC5hZGRMaXN0ZW5lcih0ZCwgJ21vdXNlZG93bicsIEwuRG9tRXZlbnQucHJldmVudERlZmF1bHQpO1xuXHRcdFx0XHRMLkRvbUV2ZW50LmFkZExpc3RlbmVyKHRkLCAnY2xpY2snLCB0aGlzLl9jcmVhdGVDbGlja0xpc3RlbmVyKHJlc3VsdHNbaV0pKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFpKSB7XG5cdFx0XHRcdHRyID0gTC5Eb21VdGlsLmNyZWF0ZSgndHInLCAnJywgdGhpcy5fcmVzdWx0VGFibGUpO1xuXHRcdFx0XHR0ZCA9IEwuRG9tVXRpbC5jcmVhdGUoJ3RkJywgJ2xlYWZsZXQtcm91dGluZy1nZW9jb2Rlci1uby1yZXN1bHRzJywgdHIpO1xuXHRcdFx0XHR0ZC5pbm5lckhUTUwgPSB0aGlzLm9wdGlvbnMubm9SZXN1bHRzTWVzc2FnZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb3BlbigpO1xuXG5cdFx0XHRpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdC8vIFNlbGVjdCB0aGUgZmlyc3QgZW50cnlcblx0XHRcdFx0dGhpcy5fc2VsZWN0KDEpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfY3JlYXRlQ2xpY2tMaXN0ZW5lcjogZnVuY3Rpb24ocikge1xuXHRcdFx0dmFyIHJlc3VsdFNlbGVjdGVkID0gdGhpcy5fcmVzdWx0U2VsZWN0ZWQocik7XG5cdFx0XHRyZXR1cm4gTC5iaW5kKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR0aGlzLl9lbGVtLmJsdXIoKTtcblx0XHRcdFx0cmVzdWx0U2VsZWN0ZWQoKTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdH0sXG5cblx0XHRfcmVzdWx0U2VsZWN0ZWQ6IGZ1bmN0aW9uKHIpIHtcblx0XHRcdHJldHVybiBMLmJpbmQoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHRoaXMuY2xvc2UoKTtcblx0XHRcdFx0dGhpcy5fZWxlbS52YWx1ZSA9IHIubmFtZTtcblx0XHRcdFx0dGhpcy5fbGFzdENvbXBsZXRlZFRleHQgPSByLm5hbWU7XG5cdFx0XHRcdHRoaXMuX3NlbGVjdEZuKHIpO1xuXHRcdFx0fSwgdGhpcyk7XG5cdFx0fSxcblxuXHRcdF9rZXlQcmVzc2VkOiBmdW5jdGlvbihlKSB7XG5cdFx0XHR2YXIgaW5kZXg7XG5cblx0XHRcdGlmICh0aGlzLl9pc09wZW4gJiYgZS5rZXlDb2RlID09PSAxMyAmJiB0aGlzLl9zZWxlY3Rpb24pIHtcblx0XHRcdFx0aW5kZXggPSBwYXJzZUludCh0aGlzLl9zZWxlY3Rpb24uZ2V0QXR0cmlidXRlKCdkYXRhLXJlc3VsdC1pbmRleCcpLCAxMCk7XG5cdFx0XHRcdHRoaXMuX3Jlc3VsdFNlbGVjdGVkKHRoaXMuX3Jlc3VsdHNbaW5kZXhdKSgpO1xuXHRcdFx0XHRMLkRvbUV2ZW50LnByZXZlbnREZWZhdWx0KGUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmtleUNvZGUgPT09IDEzKSB7XG5cdFx0XHRcdHRoaXMuX2NvbXBsZXRlKHRoaXMuX3Jlc3VsdEZuLCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fYXV0b2NvbXBsZXRlICYmIGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IHRoaXMuX2VsZW0pIHtcblx0XHRcdFx0aWYgKHRoaXMuX3RpbWVyKSB7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3RpbWVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl90aW1lciA9IHNldFRpbWVvdXQoTC5VdGlsLmJpbmQoZnVuY3Rpb24oKSB7IHRoaXMuX2NvbXBsZXRlKHRoaXMuX2F1dG9jb21wbGV0ZSk7IH0sIHRoaXMpLFxuXHRcdFx0XHRcdHRoaXMub3B0aW9ucy50aW1lb3V0KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl91bnNlbGVjdCgpO1xuXHRcdH0sXG5cblx0XHRfc2VsZWN0OiBmdW5jdGlvbihkaXIpIHtcblx0XHRcdHZhciBzZWwgPSB0aGlzLl9zZWxlY3Rpb247XG5cdFx0XHRpZiAoc2VsKSB7XG5cdFx0XHRcdEwuRG9tVXRpbC5yZW1vdmVDbGFzcyhzZWwuZmlyc3RDaGlsZCwgJ2xlYWZsZXQtcm91dGluZy1nZW9jb2Rlci1zZWxlY3RlZCcpO1xuXHRcdFx0XHRzZWwgPSBzZWxbZGlyID4gMCA/ICduZXh0U2libGluZycgOiAncHJldmlvdXNTaWJsaW5nJ107XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXNlbCkge1xuXHRcdFx0XHRzZWwgPSB0aGlzLl9yZXN1bHRUYWJsZVtkaXIgPiAwID8gJ2ZpcnN0Q2hpbGQnIDogJ2xhc3RDaGlsZCddO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2VsKSB7XG5cdFx0XHRcdEwuRG9tVXRpbC5hZGRDbGFzcyhzZWwuZmlyc3RDaGlsZCwgJ2xlYWZsZXQtcm91dGluZy1nZW9jb2Rlci1zZWxlY3RlZCcpO1xuXHRcdFx0XHR0aGlzLl9zZWxlY3Rpb24gPSBzZWw7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF91bnNlbGVjdDogZnVuY3Rpb24oKSB7XG5cdFx0XHRpZiAodGhpcy5fc2VsZWN0aW9uKSB7XG5cdFx0XHRcdEwuRG9tVXRpbC5yZW1vdmVDbGFzcyh0aGlzLl9zZWxlY3Rpb24uZmlyc3RDaGlsZCwgJ2xlYWZsZXQtcm91dGluZy1nZW9jb2Rlci1zZWxlY3RlZCcpO1xuXHRcdFx0fVxuXHRcdFx0ZGVsZXRlIHRoaXMuX3NlbGVjdGlvbjtcblx0XHR9LFxuXG5cdFx0X2tleURvd246IGZ1bmN0aW9uKGUpIHtcblx0XHRcdGlmICh0aGlzLl9pc09wZW4pIHtcblx0XHRcdFx0c3dpdGNoIChlLmtleUNvZGUpIHtcblx0XHRcdFx0Ly8gRXNjYXBlXG5cdFx0XHRcdGNhc2UgMjc6XG5cdFx0XHRcdFx0dGhpcy5jbG9zZSgpO1xuXHRcdFx0XHRcdEwuRG9tRXZlbnQucHJldmVudERlZmF1bHQoZSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHQvLyBVcFxuXHRcdFx0XHRjYXNlIDM4OlxuXHRcdFx0XHRcdHRoaXMuX3NlbGVjdCgtMSk7XG5cdFx0XHRcdFx0TC5Eb21FdmVudC5wcmV2ZW50RGVmYXVsdChlKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdC8vIERvd25cblx0XHRcdFx0Y2FzZSA0MDpcblx0XHRcdFx0XHR0aGlzLl9zZWxlY3QoMSk7XG5cdFx0XHRcdFx0TC5Eb21FdmVudC5wcmV2ZW50RGVmYXVsdChlKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X2NvbXBsZXRlOiBmdW5jdGlvbihjb21wbGV0ZUZuLCB0cnlTZWxlY3QpIHtcblx0XHRcdHZhciB2ID0gdGhpcy5fZWxlbS52YWx1ZTtcblx0XHRcdGZ1bmN0aW9uIGNvbXBsZXRlUmVzdWx0cyhyZXN1bHRzKSB7XG5cdFx0XHRcdHRoaXMuX2xhc3RDb21wbGV0ZWRUZXh0ID0gdjtcblx0XHRcdFx0aWYgKHRyeVNlbGVjdCAmJiByZXN1bHRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdHRoaXMuX3Jlc3VsdFNlbGVjdGVkKHJlc3VsdHNbMF0pKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0UmVzdWx0cyhyZXN1bHRzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXYpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodiAhPT0gdGhpcy5fbGFzdENvbXBsZXRlZFRleHQpIHtcblx0XHRcdFx0Y29tcGxldGVGbih2LCBjb21wbGV0ZVJlc3VsdHMsIHRoaXMpO1xuXHRcdFx0fSBlbHNlIGlmICh0cnlTZWxlY3QpIHtcblx0XHRcdFx0Y29tcGxldGVSZXN1bHRzLmNhbGwodGhpcywgdGhpcy5fcmVzdWx0cyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn0pKCk7XG4iLCIoZnVuY3Rpb24oKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuXHR2YXIgTCA9IHJlcXVpcmUoJ2xlYWZsZXQnKTtcblxuXHRMLlJvdXRpbmcgPSBMLlJvdXRpbmcgfHwge307XG5cdEwuZXh0ZW5kKEwuUm91dGluZywgcmVxdWlyZSgnLi9MLlJvdXRpbmcuSXRpbmVyYXJ5JykpO1xuXHRMLmV4dGVuZChMLlJvdXRpbmcsIHJlcXVpcmUoJy4vTC5Sb3V0aW5nLkxpbmUnKSk7XG5cdEwuZXh0ZW5kKEwuUm91dGluZywgcmVxdWlyZSgnLi9MLlJvdXRpbmcuUGxhbicpKTtcblx0TC5leHRlbmQoTC5Sb3V0aW5nLCByZXF1aXJlKCcuL0wuUm91dGluZy5PU1JNJykpO1xuXG5cdEwuUm91dGluZy5Db250cm9sID0gTC5Sb3V0aW5nLkl0aW5lcmFyeS5leHRlbmQoe1xuXHRcdG9wdGlvbnM6IHtcblx0XHRcdGZpdFNlbGVjdGVkUm91dGVzOiAnc21hcnQnLFxuXHRcdFx0cm91dGVMaW5lOiBmdW5jdGlvbihyb3V0ZSwgb3B0aW9ucykgeyByZXR1cm4gTC5Sb3V0aW5nLmxpbmUocm91dGUsIG9wdGlvbnMpOyB9LFxuXHRcdFx0YXV0b1JvdXRlOiB0cnVlLFxuXHRcdFx0cm91dGVXaGlsZURyYWdnaW5nOiBmYWxzZSxcblx0XHRcdHJvdXRlRHJhZ0ludGVydmFsOiA1MDAsXG5cdFx0XHR3YXlwb2ludE1vZGU6ICdjb25uZWN0Jyxcblx0XHRcdHVzZVpvb21QYXJhbWV0ZXI6IGZhbHNlXG5cdFx0fSxcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uKG9wdGlvbnMpIHtcblx0XHRcdEwuVXRpbC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xuXG5cdFx0XHR0aGlzLl9yb3V0ZXIgPSB0aGlzLm9wdGlvbnMucm91dGVyIHx8IG5ldyBMLlJvdXRpbmcuT1NSTShvcHRpb25zKTtcblx0XHRcdHRoaXMuX3BsYW4gPSB0aGlzLm9wdGlvbnMucGxhbiB8fCBMLlJvdXRpbmcucGxhbih0aGlzLm9wdGlvbnMud2F5cG9pbnRzLCBvcHRpb25zKTtcblx0XHRcdHRoaXMuX3JlcXVlc3RDb3VudCA9IDA7XG5cblx0XHRcdEwuUm91dGluZy5JdGluZXJhcnkucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBvcHRpb25zKTtcblxuXHRcdFx0dGhpcy5vbigncm91dGVzZWxlY3RlZCcsIHRoaXMuX3JvdXRlU2VsZWN0ZWQsIHRoaXMpO1xuXHRcdFx0dGhpcy5fcGxhbi5vbignd2F5cG9pbnRzY2hhbmdlZCcsIHRoaXMuX29uV2F5cG9pbnRzQ2hhbmdlZCwgdGhpcyk7XG5cdFx0XHRpZiAob3B0aW9ucy5yb3V0ZVdoaWxlRHJhZ2dpbmcpIHtcblx0XHRcdFx0dGhpcy5fc2V0dXBSb3V0ZURyYWdnaW5nKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLm9wdGlvbnMuYXV0b1JvdXRlKSB7XG5cdFx0XHRcdHRoaXMucm91dGUoKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0b25BZGQ6IGZ1bmN0aW9uKG1hcCkge1xuXHRcdFx0dmFyIGNvbnRhaW5lciA9IEwuUm91dGluZy5JdGluZXJhcnkucHJvdG90eXBlLm9uQWRkLmNhbGwodGhpcywgbWFwKTtcblxuXHRcdFx0dGhpcy5fbWFwID0gbWFwO1xuXHRcdFx0dGhpcy5fbWFwLmFkZExheWVyKHRoaXMuX3BsYW4pO1xuXG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLnVzZVpvb21QYXJhbWV0ZXIpIHtcblx0XHRcdFx0dGhpcy5fbWFwLm9uKCd6b29tZW5kJywgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0dGhpcy5yb3V0ZSh7XG5cdFx0XHRcdFx0XHRjYWxsYmFjazogTC5iaW5kKHRoaXMuX3VwZGF0ZUxpbmVDYWxsYmFjaywgdGhpcylcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSwgdGhpcyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9wbGFuLm9wdGlvbnMuZ2VvY29kZXIpIHtcblx0XHRcdFx0Y29udGFpbmVyLmluc2VydEJlZm9yZSh0aGlzLl9wbGFuLmNyZWF0ZUdlb2NvZGVycygpLCBjb250YWluZXIuZmlyc3RDaGlsZCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0fSxcblxuXHRcdG9uUmVtb3ZlOiBmdW5jdGlvbihtYXApIHtcblx0XHRcdGlmICh0aGlzLl9saW5lKSB7XG5cdFx0XHRcdG1hcC5yZW1vdmVMYXllcih0aGlzLl9saW5lKTtcblx0XHRcdH1cblx0XHRcdG1hcC5yZW1vdmVMYXllcih0aGlzLl9wbGFuKTtcblx0XHRcdHJldHVybiBMLlJvdXRpbmcuSXRpbmVyYXJ5LnByb3RvdHlwZS5vblJlbW92ZS5jYWxsKHRoaXMsIG1hcCk7XG5cdFx0fSxcblxuXHRcdGdldFdheXBvaW50czogZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGxhbi5nZXRXYXlwb2ludHMoKTtcblx0XHR9LFxuXG5cdFx0c2V0V2F5cG9pbnRzOiBmdW5jdGlvbih3YXlwb2ludHMpIHtcblx0XHRcdHRoaXMuX3BsYW4uc2V0V2F5cG9pbnRzKHdheXBvaW50cyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9LFxuXG5cdFx0c3BsaWNlV2F5cG9pbnRzOiBmdW5jdGlvbigpIHtcblx0XHRcdHZhciByZW1vdmVkID0gdGhpcy5fcGxhbi5zcGxpY2VXYXlwb2ludHMuYXBwbHkodGhpcy5fcGxhbiwgYXJndW1lbnRzKTtcblx0XHRcdHJldHVybiByZW1vdmVkO1xuXHRcdH0sXG5cblx0XHRnZXRQbGFuOiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB0aGlzLl9wbGFuO1xuXHRcdH0sXG5cblx0XHRnZXRSb3V0ZXI6IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JvdXRlcjtcblx0XHR9LFxuXG5cdFx0X3JvdXRlU2VsZWN0ZWQ6IGZ1bmN0aW9uKGUpIHtcblx0XHRcdHZhciByb3V0ZSA9IGUucm91dGUsXG5cdFx0XHRcdGZpdE1vZGUgPSB0aGlzLm9wdGlvbnMuZml0U2VsZWN0ZWRSb3V0ZXMsXG5cdFx0XHRcdGZpdEJvdW5kcyA9XG5cdFx0XHRcdFx0KGZpdE1vZGUgPT09ICdzbWFydCcgJiYgIXRoaXMuX3dheXBvaW50c1Zpc2libGUoKSkgfHxcblx0XHRcdFx0XHQoZml0TW9kZSAhPT0gJ3NtYXJ0JyAmJiBmaXRNb2RlKTtcblxuXHRcdFx0dGhpcy5fdXBkYXRlTGluZShyb3V0ZSk7XG5cblx0XHRcdGlmIChmaXRCb3VuZHMpIHtcblx0XHRcdFx0dGhpcy5fbWFwLmZpdEJvdW5kcyh0aGlzLl9saW5lLmdldEJvdW5kcygpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy53YXlwb2ludE1vZGUgPT09ICdzbmFwJykge1xuXHRcdFx0XHR0aGlzLl9wbGFuLm9mZignd2F5cG9pbnRzY2hhbmdlZCcsIHRoaXMuX29uV2F5cG9pbnRzQ2hhbmdlZCwgdGhpcyk7XG5cdFx0XHRcdHRoaXMuc2V0V2F5cG9pbnRzKHJvdXRlLndheXBvaW50cyk7XG5cdFx0XHRcdHRoaXMuX3BsYW4ub24oJ3dheXBvaW50c2NoYW5nZWQnLCB0aGlzLl9vbldheXBvaW50c0NoYW5nZWQsIHRoaXMpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfd2F5cG9pbnRzVmlzaWJsZTogZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgd3BzID0gdGhpcy5nZXRXYXlwb2ludHMoKSxcblx0XHRcdFx0bWFwU2l6ZSxcblx0XHRcdFx0Ym91bmRzLFxuXHRcdFx0XHRib3VuZHNTaXplLFxuXHRcdFx0XHRpLFxuXHRcdFx0XHRwO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRtYXBTaXplID0gdGhpcy5fbWFwLmdldFNpemUoKTtcblxuXHRcdFx0XHRmb3IgKGkgPSAwOyBpIDwgd3BzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0cCA9IHRoaXMuX21hcC5sYXRMbmdUb0xheWVyUG9pbnQod3BzW2ldLmxhdExuZyk7XG5cblx0XHRcdFx0XHRpZiAoYm91bmRzKSB7XG5cdFx0XHRcdFx0XHRib3VuZHMuZXh0ZW5kKHApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRib3VuZHMgPSBMLmJvdW5kcyhbcF0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJvdW5kc1NpemUgPSBib3VuZHMuZ2V0U2l6ZSgpO1xuXHRcdFx0XHRyZXR1cm4gKGJvdW5kc1NpemUueCA+IG1hcFNpemUueCAvIDUgfHxcblx0XHRcdFx0XHRib3VuZHNTaXplLnkgPiBtYXBTaXplLnkgLyA1KSAmJiB0aGlzLl93YXlwb2ludHNJblZpZXdwb3J0KCk7XG5cdFx0XHRcdFx0XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X3dheXBvaW50c0luVmlld3BvcnQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIHdwcyA9IHRoaXMuZ2V0V2F5cG9pbnRzKCksXG5cdFx0XHRcdG1hcEJvdW5kcyxcblx0XHRcdFx0aTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bWFwQm91bmRzID0gdGhpcy5fbWFwLmdldEJvdW5kcygpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoaSA9IDA7IGkgPCB3cHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKG1hcEJvdW5kcy5jb250YWlucyh3cHNbaV0ubGF0TG5nKSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9LFxuXG5cdFx0X3VwZGF0ZUxpbmU6IGZ1bmN0aW9uKHJvdXRlKSB7XG5cdFx0XHR2YXIgYWRkV2F5cG9pbnRzID0gdGhpcy5vcHRpb25zLmFkZFdheXBvaW50cyAhPT0gdW5kZWZpbmVkID9cblx0XHRcdFx0dGhpcy5vcHRpb25zLmFkZFdheXBvaW50cyA6IHRydWU7XG5cdFx0XHR0aGlzLl9jbGVhckxpbmUoKTtcblxuXHRcdFx0dGhpcy5fbGluZSA9IHRoaXMub3B0aW9ucy5yb3V0ZUxpbmUocm91dGUsXG5cdFx0XHRcdEwuZXh0ZW5kKHtcblx0XHRcdFx0XHRhZGRXYXlwb2ludHM6IGFkZFdheXBvaW50cyxcblx0XHRcdFx0XHRleHRlbmRUb1dheXBvaW50czogdGhpcy5vcHRpb25zLndheXBvaW50TW9kZSA9PT0gJ2Nvbm5lY3QnXG5cdFx0XHRcdH0sIHRoaXMub3B0aW9ucy5saW5lT3B0aW9ucykpO1xuXHRcdFx0dGhpcy5fbGluZS5hZGRUbyh0aGlzLl9tYXApO1xuXHRcdFx0dGhpcy5faG9va0V2ZW50cyh0aGlzLl9saW5lKTtcblx0XHR9LFxuXG5cdFx0X2hvb2tFdmVudHM6IGZ1bmN0aW9uKGwpIHtcblx0XHRcdGwub24oJ2xpbmV0b3VjaGVkJywgZnVuY3Rpb24oZSkge1xuXHRcdFx0XHR0aGlzLl9wbGFuLmRyYWdOZXdXYXlwb2ludChlKTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdH0sXG5cblx0XHRfb25XYXlwb2ludHNDaGFuZ2VkOiBmdW5jdGlvbihlKSB7XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLmF1dG9Sb3V0ZSkge1xuXHRcdFx0XHR0aGlzLnJvdXRlKHt9KTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fcGxhbi5pc1JlYWR5KCkpIHtcblx0XHRcdFx0dGhpcy5fY2xlYXJMaW5lKCk7XG5cdFx0XHRcdHRoaXMuX2NsZWFyQWx0cygpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5maXJlKCd3YXlwb2ludHNjaGFuZ2VkJywge3dheXBvaW50czogZS53YXlwb2ludHN9KTtcblx0XHR9LFxuXG5cdFx0X3NldHVwUm91dGVEcmFnZ2luZzogZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgdGltZXIgPSAwLFxuXHRcdFx0XHR3YXlwb2ludHM7XG5cblx0XHRcdHRoaXMuX3BsYW4ub24oJ3dheXBvaW50ZHJhZycsIEwuYmluZChmdW5jdGlvbihlKSB7XG5cdFx0XHRcdHdheXBvaW50cyA9IGUud2F5cG9pbnRzO1xuXG5cdFx0XHRcdGlmICghdGltZXIpIHtcblx0XHRcdFx0XHR0aW1lciA9IHNldFRpbWVvdXQoTC5iaW5kKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0dGhpcy5yb3V0ZSh7XG5cdFx0XHRcdFx0XHRcdHdheXBvaW50czogd2F5cG9pbnRzLFxuXHRcdFx0XHRcdFx0XHRnZW9tZXRyeU9ubHk6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGNhbGxiYWNrOiBMLmJpbmQodGhpcy5fdXBkYXRlTGluZUNhbGxiYWNrLCB0aGlzKVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR0aW1lciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9LCB0aGlzKSwgdGhpcy5vcHRpb25zLnJvdXRlRHJhZ0ludGVydmFsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdGhpcykpO1xuXHRcdFx0dGhpcy5fcGxhbi5vbignd2F5cG9pbnRkcmFnZW5kJywgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGlmICh0aW1lcikge1xuXHRcdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0XHRcdFx0dGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5yb3V0ZSgpO1xuXHRcdFx0fSwgdGhpcyk7XG5cdFx0fSxcblxuXHRcdF91cGRhdGVMaW5lQ2FsbGJhY2s6IGZ1bmN0aW9uKGVyciwgcm91dGVzKSB7XG5cdFx0XHRpZiAoIWVycikge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVMaW5lKHJvdXRlc1swXSk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdHJvdXRlOiBmdW5jdGlvbihvcHRpb25zKSB7XG5cdFx0XHR2YXIgdHMgPSArK3RoaXMuX3JlcXVlc3RDb3VudCxcblx0XHRcdFx0d3BzO1xuXG5cdFx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuXHRcdFx0aWYgKHRoaXMuX3BsYW4uaXNSZWFkeSgpKSB7XG5cdFx0XHRcdGlmICh0aGlzLm9wdGlvbnMudXNlWm9vbVBhcmFtZXRlcikge1xuXHRcdFx0XHRcdG9wdGlvbnMueiA9IHRoaXMuX21hcCAmJiB0aGlzLl9tYXAuZ2V0Wm9vbSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0d3BzID0gb3B0aW9ucyAmJiBvcHRpb25zLndheXBvaW50cyB8fCB0aGlzLl9wbGFuLmdldFdheXBvaW50cygpO1xuXHRcdFx0XHR0aGlzLmZpcmUoJ3JvdXRpbmdzdGFydCcsIHt3YXlwb2ludHM6IHdwc30pO1xuXHRcdFx0XHR0aGlzLl9yb3V0ZXIucm91dGUod3BzLCBvcHRpb25zLmNhbGxiYWNrIHx8IGZ1bmN0aW9uKGVyciwgcm91dGVzKSB7XG5cdFx0XHRcdFx0Ly8gUHJldmVudCByYWNlIGFtb25nIG11bHRpcGxlIHJlcXVlc3RzLFxuXHRcdFx0XHRcdC8vIGJ5IGNoZWNraW5nIHRoZSBjdXJyZW50IHJlcXVlc3QncyB0aW1lc3RhbXBcblx0XHRcdFx0XHQvLyBhZ2FpbnN0IHRoZSBsYXN0IHJlcXVlc3QnczsgaWdub3JlIHJlc3VsdCBpZlxuXHRcdFx0XHRcdC8vIHRoaXMgaXNuJ3QgdGhlIGxhdGVzdCByZXF1ZXN0LlxuXHRcdFx0XHRcdGlmICh0cyA9PT0gdGhpcy5fcmVxdWVzdENvdW50KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jbGVhckxpbmUoKTtcblx0XHRcdFx0XHRcdHRoaXMuX2NsZWFyQWx0cygpO1xuXHRcdFx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmZpcmUoJ3JvdXRpbmdlcnJvcicsIHtlcnJvcjogZXJyfSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKCFvcHRpb25zLmdlb21ldHJ5T25seSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmZpcmUoJ3JvdXRlc2ZvdW5kJywge3dheXBvaW50czogd3BzLCByb3V0ZXM6IHJvdXRlc30pO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnNldEFsdGVybmF0aXZlcyhyb3V0ZXMpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcm91dGVTZWxlY3RlZCh7cm91dGU6IHJvdXRlc1swXX0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgdGhpcywgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF9jbGVhckxpbmU6IGZ1bmN0aW9uKCkge1xuXHRcdFx0aWYgKHRoaXMuX2xpbmUpIHtcblx0XHRcdFx0dGhpcy5fbWFwLnJlbW92ZUxheWVyKHRoaXMuX2xpbmUpO1xuXHRcdFx0XHRkZWxldGUgdGhpcy5fbGluZTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdEwuUm91dGluZy5jb250cm9sID0gZnVuY3Rpb24ob3B0aW9ucykge1xuXHRcdHJldHVybiBuZXcgTC5Sb3V0aW5nLkNvbnRyb2wob3B0aW9ucyk7XG5cdH07XG5cblx0bW9kdWxlLmV4cG9ydHMgPSBMLlJvdXRpbmc7XG59KSgpO1xuIiwiKGZ1bmN0aW9uKCkge1xuXHQndXNlIHN0cmljdCc7XG5cblx0dmFyIEwgPSByZXF1aXJlKCdsZWFmbGV0Jyk7XG5cblx0TC5Sb3V0aW5nID0gTC5Sb3V0aW5nIHx8IHt9O1xuXG5cdEwuZXh0ZW5kKEwuUm91dGluZywgcmVxdWlyZSgnLi9MLlJvdXRpbmcuTG9jYWxpemF0aW9uJykpO1xuXG5cdEwuUm91dGluZy5Gb3JtYXR0ZXIgPSBMLkNsYXNzLmV4dGVuZCh7XG5cdFx0b3B0aW9uczoge1xuXHRcdFx0dW5pdHM6ICdtZXRyaWMnLFxuXHRcdFx0dW5pdE5hbWVzOiB7XG5cdFx0XHRcdG1ldGVyczogJ20nLFxuXHRcdFx0XHRraWxvbWV0ZXJzOiAna20nLFxuXHRcdFx0XHR5YXJkczogJ3lkJyxcblx0XHRcdFx0bWlsZXM6ICdtaScsXG5cdFx0XHRcdGhvdXJzOiAnaCcsXG5cdFx0XHRcdG1pbnV0ZXM6ICdtw61uJyxcblx0XHRcdFx0c2Vjb25kczogJ3MnXG5cdFx0XHR9LFxuXHRcdFx0bGFuZ3VhZ2U6ICdlbicsXG5cdFx0XHRyb3VuZGluZ1NlbnNpdGl2aXR5OiAxLFxuXHRcdFx0ZGlzdGFuY2VUZW1wbGF0ZTogJ3t2YWx1ZX0ge3VuaXR9J1xuXHRcdH0sXG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbihvcHRpb25zKSB7XG5cdFx0XHRMLnNldE9wdGlvbnModGhpcywgb3B0aW9ucyk7XG5cdFx0fSxcblxuXHRcdGZvcm1hdERpc3RhbmNlOiBmdW5jdGlvbihkIC8qIE51bWJlciAobWV0ZXJzKSAqLykge1xuXHRcdFx0dmFyIHVuID0gdGhpcy5vcHRpb25zLnVuaXROYW1lcyxcblx0XHRcdCAgICB2LFxuXHRcdFx0XHRkYXRhO1xuXG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLnVuaXRzID09PSAnaW1wZXJpYWwnKSB7XG5cdFx0XHRcdGQgPSBkIC8gMS42MDkzNDQ7XG5cdFx0XHRcdGlmIChkID49IDEwMDApIHtcblx0XHRcdFx0XHRkYXRhID0ge1xuXHRcdFx0XHRcdFx0dmFsdWU6ICh0aGlzLl9yb3VuZChkKSAvIDEwMDApLFxuXHRcdFx0XHRcdFx0dW5pdDogdW4ubWlsZXNcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRhdGEgPSB7XG5cdFx0XHRcdFx0XHR2YWx1ZTogdGhpcy5fcm91bmQoZCAvIDEuNzYwKSxcblx0XHRcdFx0XHRcdHVuaXQ6IHVuLnlhcmRzXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0diA9IHRoaXMuX3JvdW5kKGQpO1xuXHRcdFx0XHRkYXRhID0ge1xuXHRcdFx0XHRcdHZhbHVlOiB2ID49IDEwMDAgPyAodiAvIDEwMDApIDogdixcblx0XHRcdFx0XHR1bml0OiB2ID49IDEwMDAgPyB1bi5raWxvbWV0ZXJzIDogdW4ubWV0ZXJzXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBMLlV0aWwudGVtcGxhdGUodGhpcy5vcHRpb25zLmRpc3RhbmNlVGVtcGxhdGUsIGRhdGEpO1xuXHRcdH0sXG5cblx0XHRfcm91bmQ6IGZ1bmN0aW9uKGQpIHtcblx0XHRcdHZhciBwb3cxMCA9IE1hdGgucG93KDEwLCAoTWF0aC5mbG9vcihkIC8gdGhpcy5vcHRpb25zLnJvdW5kaW5nU2Vuc2l0aXZpdHkpICsgJycpLmxlbmd0aCAtIDEpLFxuXHRcdFx0XHRyID0gTWF0aC5mbG9vcihkIC8gcG93MTApLFxuXHRcdFx0XHRwID0gKHIgPiA1KSA/IHBvdzEwIDogcG93MTAgLyAyO1xuXG5cdFx0XHRyZXR1cm4gTWF0aC5yb3VuZChkIC8gcCkgKiBwO1xuXHRcdH0sXG5cblx0XHRmb3JtYXRUaW1lOiBmdW5jdGlvbih0IC8qIE51bWJlciAoc2Vjb25kcykgKi8pIHtcblx0XHRcdGlmICh0ID4gODY0MDApIHtcblx0XHRcdFx0cmV0dXJuIE1hdGgucm91bmQodCAvIDM2MDApICsgJyBoJztcblx0XHRcdH0gZWxzZSBpZiAodCA+IDM2MDApIHtcblx0XHRcdFx0cmV0dXJuIE1hdGguZmxvb3IodCAvIDM2MDApICsgJyBoICcgK1xuXHRcdFx0XHRcdE1hdGgucm91bmQoKHQgJSAzNjAwKSAvIDYwKSArICcgbWluJztcblx0XHRcdH0gZWxzZSBpZiAodCA+IDMwMCkge1xuXHRcdFx0XHRyZXR1cm4gTWF0aC5yb3VuZCh0IC8gNjApICsgJyBtaW4nO1xuXHRcdFx0fSBlbHNlIGlmICh0ID4gNjApIHtcblx0XHRcdFx0cmV0dXJuIE1hdGguZmxvb3IodCAvIDYwKSArICcgbWluJyArXG5cdFx0XHRcdFx0KHQgJSA2MCAhPT0gMCA/ICcgJyArICh0ICUgNjApICsgJyBzJyA6ICcnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB0ICsgJyBzJztcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0Zm9ybWF0SW5zdHJ1Y3Rpb246IGZ1bmN0aW9uKGluc3RyLCBpKSB7XG5cdFx0XHRpZiAoaW5zdHIudGV4dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBMLlV0aWwudGVtcGxhdGUodGhpcy5fZ2V0SW5zdHJ1Y3Rpb25UZW1wbGF0ZShpbnN0ciwgaSksXG5cdFx0XHRcdFx0TC5leHRlbmQoe1xuXHRcdFx0XHRcdFx0ZXhpdFN0cjogaW5zdHIuZXhpdCA/IEwuUm91dGluZy5Mb2NhbGl6YXRpb25bdGhpcy5vcHRpb25zLmxhbmd1YWdlXS5mb3JtYXRPcmRlcihpbnN0ci5leGl0KSA6ICcnLFxuXHRcdFx0XHRcdFx0ZGlyOiBMLlJvdXRpbmcuTG9jYWxpemF0aW9uW3RoaXMub3B0aW9ucy5sYW5ndWFnZV0uZGlyZWN0aW9uc1tpbnN0ci5kaXJlY3Rpb25dXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRpbnN0cikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGluc3RyLnRleHQ7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdGdldEljb25OYW1lOiBmdW5jdGlvbihpbnN0ciwgaSkge1xuXHRcdFx0c3dpdGNoIChpbnN0ci50eXBlKSB7XG5cdFx0XHRjYXNlICdTdHJhaWdodCc6XG5cdFx0XHRcdHJldHVybiAoaSA9PT0gMCA/ICdkZXBhcnQnIDogJ2NvbnRpbnVlJyk7XG5cdFx0XHRjYXNlICdTbGlnaHRSaWdodCc6XG5cdFx0XHRcdHJldHVybiAnYmVhci1yaWdodCc7XG5cdFx0XHRjYXNlICdSaWdodCc6XG5cdFx0XHRcdHJldHVybiAndHVybi1yaWdodCc7XG5cdFx0XHRjYXNlICdTaGFycFJpZ2h0Jzpcblx0XHRcdFx0cmV0dXJuICdzaGFycC1yaWdodCc7XG5cdFx0XHRjYXNlICdUdXJuQXJvdW5kJzpcblx0XHRcdFx0cmV0dXJuICd1LXR1cm4nO1xuXHRcdFx0Y2FzZSAnU2hhcnBMZWZ0Jzpcblx0XHRcdFx0cmV0dXJuICdzaGFycC1sZWZ0Jztcblx0XHRcdGNhc2UgJ0xlZnQnOlxuXHRcdFx0XHRyZXR1cm4gJ3R1cm4tbGVmdCc7XG5cdFx0XHRjYXNlICdTbGlnaHRMZWZ0Jzpcblx0XHRcdFx0cmV0dXJuICdiZWFyLWxlZnQnO1xuXHRcdFx0Y2FzZSAnV2F5cG9pbnRSZWFjaGVkJzpcblx0XHRcdFx0cmV0dXJuICd2aWEnO1xuXHRcdFx0Y2FzZSAnUm91bmRhYm91dCc6XG5cdFx0XHRcdHJldHVybiAnZW50ZXItcm91bmRhYm91dCc7XG5cdFx0XHRjYXNlICdEZXN0aW5hdGlvblJlYWNoZWQnOlxuXHRcdFx0XHRyZXR1cm4gJ2Fycml2ZSc7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF9nZXRJbnN0cnVjdGlvblRlbXBsYXRlOiBmdW5jdGlvbihpbnN0ciwgaSkge1xuXHRcdFx0dmFyIHR5cGUgPSBpbnN0ci50eXBlID09PSAnU3RyYWlnaHQnID8gKGkgPT09IDAgPyAnSGVhZCcgOiAnQ29udGludWUnKSA6IGluc3RyLnR5cGUsXG5cdFx0XHRcdHN0cmluZ3MgPSBMLlJvdXRpbmcuTG9jYWxpemF0aW9uW3RoaXMub3B0aW9ucy5sYW5ndWFnZV0uaW5zdHJ1Y3Rpb25zW3R5cGVdO1xuXG5cdFx0XHRyZXR1cm4gc3RyaW5nc1swXSArIChzdHJpbmdzLmxlbmd0aCA+IDEgJiYgaW5zdHIucm9hZCA/IHN0cmluZ3NbMV0gOiAnJyk7XG5cdFx0fVxuXHR9KTtcblxuXHRtb2R1bGUuZXhwb3J0cyA9IEwuUm91dGluZztcbn0pKCk7XG5cbiIsIihmdW5jdGlvbigpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG5cdHZhciBMID0gcmVxdWlyZSgnbGVhZmxldCcpO1xuXG5cdEwuUm91dGluZyA9IEwuUm91dGluZyB8fCB7fTtcblx0TC5leHRlbmQoTC5Sb3V0aW5nLCByZXF1aXJlKCcuL0wuUm91dGluZy5Gb3JtYXR0ZXInKSk7XG5cdEwuZXh0ZW5kKEwuUm91dGluZywgcmVxdWlyZSgnLi9MLlJvdXRpbmcuSXRpbmVyYXJ5QnVpbGRlcicpKTtcblxuXHRMLlJvdXRpbmcuSXRpbmVyYXJ5ID0gTC5Db250cm9sLmV4dGVuZCh7XG5cdFx0aW5jbHVkZXM6IEwuTWl4aW4uRXZlbnRzLFxuXG5cdFx0b3B0aW9uczoge1xuXHRcdFx0cG9pbnRNYXJrZXJTdHlsZToge1xuXHRcdFx0XHRyYWRpdXM6IDUsXG5cdFx0XHRcdGNvbG9yOiAnIzAzZicsXG5cdFx0XHRcdGZpbGxDb2xvcjogJ3doaXRlJyxcblx0XHRcdFx0b3BhY2l0eTogMSxcblx0XHRcdFx0ZmlsbE9wYWNpdHk6IDAuN1xuXHRcdFx0fSxcblx0XHRcdHN1bW1hcnlUZW1wbGF0ZTogJzxoMj57bmFtZX08L2gyPjxoMz57ZGlzdGFuY2V9LCB7dGltZX08L2gzPicsXG5cdFx0XHR0aW1lVGVtcGxhdGU6ICd7dGltZX0nLFxuXHRcdFx0Y29udGFpbmVyQ2xhc3NOYW1lOiAnJyxcblx0XHRcdGFsdGVybmF0aXZlQ2xhc3NOYW1lOiAnJyxcblx0XHRcdG1pbmltaXplZENsYXNzTmFtZTogJycsXG5cdFx0XHRpdGluZXJhcnlDbGFzc05hbWU6ICcnLFxuXHRcdFx0c2hvdzogdHJ1ZSxcblx0XHRcdGNvbGxhcHNpYmxlOiB1bmRlZmluZWRcblx0XHR9LFxuXG5cdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24ob3B0aW9ucykge1xuXHRcdFx0TC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xuXHRcdFx0dGhpcy5fZm9ybWF0dGVyID0gdGhpcy5vcHRpb25zLmZvcm1hdHRlciB8fCBuZXcgTC5Sb3V0aW5nLkZvcm1hdHRlcih0aGlzLm9wdGlvbnMpO1xuXHRcdFx0dGhpcy5faXRpbmVyYXJ5QnVpbGRlciA9IHRoaXMub3B0aW9ucy5pdGluZXJhcnlCdWlsZGVyIHx8IG5ldyBMLlJvdXRpbmcuSXRpbmVyYXJ5QnVpbGRlcih7XG5cdFx0XHRcdGNvbnRhaW5lckNsYXNzTmFtZTogdGhpcy5vcHRpb25zLml0aW5lcmFyeUNsYXNzTmFtZVxuXHRcdFx0fSk7XG5cdFx0fSxcblxuXHRcdG9uQWRkOiBmdW5jdGlvbihtYXApIHtcblx0XHRcdHZhciBjb2xsYXBzaWJsZSA9IHRoaXMub3B0aW9ucy5jb2xsYXBzaWJsZSxcblx0XHRcdFx0Y29sbGFwc2VCdG47XG5cblx0XHRcdGNvbGxhcHNpYmxlID0gY29sbGFwc2libGUgfHwgKGNvbGxhcHNpYmxlID09PSB1bmRlZmluZWQgJiYgbWFwLmdldFNpemUoKS54IDw9IDY0MCk7XG5cblx0XHRcdHRoaXMuX2NvbnRhaW5lciA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsICdsZWFmbGV0LXJvdXRpbmctY29udGFpbmVyIGxlYWZsZXQtYmFyICcgK1xuXHRcdFx0XHQoIXRoaXMub3B0aW9ucy5zaG93ID8gJ2xlYWZsZXQtcm91dGluZy1jb250YWluZXItaGlkZSAnIDogJycpICtcblx0XHRcdFx0KGNvbGxhcHNpYmxlID8gJ2xlYWZsZXQtcm91dGluZy1jb2xsYXBzaWJsZSAnIDogJycpICtcblx0XHRcdFx0dGhpcy5vcHRpb25zLmNvbnRhaW5lckNsYXNzTmFtZSk7XG5cdFx0XHR0aGlzLl9hbHRDb250YWluZXIgPSB0aGlzLmNyZWF0ZUFsdGVybmF0aXZlc0NvbnRhaW5lcigpO1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2FsdENvbnRhaW5lcik7XG5cdFx0XHRMLkRvbUV2ZW50LmRpc2FibGVDbGlja1Byb3BhZ2F0aW9uKHRoaXMuX2NvbnRhaW5lcik7XG5cdFx0XHRMLkRvbUV2ZW50LmFkZExpc3RlbmVyKHRoaXMuX2NvbnRhaW5lciwgJ21vdXNld2hlZWwnLCBmdW5jdGlvbihlKSB7XG5cdFx0XHRcdEwuRG9tRXZlbnQuc3RvcFByb3BhZ2F0aW9uKGUpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChjb2xsYXBzaWJsZSkge1xuXHRcdFx0XHRjb2xsYXBzZUJ0biA9IEwuRG9tVXRpbC5jcmVhdGUoJ3NwYW4nLCAnbGVhZmxldC1yb3V0aW5nLWNvbGxhcHNlLWJ0bicpO1xuXHRcdFx0XHRMLkRvbUV2ZW50Lm9uKGNvbGxhcHNlQnRuLCAnY2xpY2snLCB0aGlzLl90b2dnbGUsIHRoaXMpO1xuXHRcdFx0XHR0aGlzLl9jb250YWluZXIuaW5zZXJ0QmVmb3JlKGNvbGxhcHNlQnRuLCB0aGlzLl9jb250YWluZXIuZmlyc3RDaGlsZCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLl9jb250YWluZXI7XG5cdFx0fSxcblxuXHRcdG9uUmVtb3ZlOiBmdW5jdGlvbigpIHtcblx0XHR9LFxuXG5cdFx0Y3JlYXRlQWx0ZXJuYXRpdmVzQ29udGFpbmVyOiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCAnbGVhZmxldC1yb3V0aW5nLWFsdGVybmF0aXZlcy1jb250YWluZXInKTtcblx0XHR9LFxuXG5cdFx0c2V0QWx0ZXJuYXRpdmVzOiBmdW5jdGlvbihyb3V0ZXMpIHtcblx0XHRcdHZhciBpLFxuXHRcdFx0ICAgIGFsdCxcblx0XHRcdCAgICBhbHREaXY7XG5cblx0XHRcdHRoaXMuX2NsZWFyQWx0cygpO1xuXG5cdFx0XHR0aGlzLl9yb3V0ZXMgPSByb3V0ZXM7XG5cblx0XHRcdGZvciAoaSA9IDA7IGkgPCB0aGlzLl9yb3V0ZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0YWx0ID0gdGhpcy5fcm91dGVzW2ldO1xuXHRcdFx0XHRhbHREaXYgPSB0aGlzLl9jcmVhdGVBbHRlcm5hdGl2ZShhbHQsIGkpO1xuXHRcdFx0XHR0aGlzLl9hbHRDb250YWluZXIuYXBwZW5kQ2hpbGQoYWx0RGl2KTtcblx0XHRcdFx0dGhpcy5fYWx0RWxlbWVudHMucHVzaChhbHREaXYpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmZpcmUoJ3JvdXRlc2VsZWN0ZWQnLCB7cm91dGU6IHRoaXMuX3JvdXRlc1swXX0pO1xuXG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9LFxuXG5cdFx0c2hvdzogZnVuY3Rpb24oKSB7XG5cdFx0XHRMLkRvbVV0aWwucmVtb3ZlQ2xhc3ModGhpcy5fY29udGFpbmVyLCAnbGVhZmxldC1yb3V0aW5nLWNvbnRhaW5lci1oaWRlJyk7XG5cdFx0fSxcblxuXHRcdGhpZGU6IGZ1bmN0aW9uKCkge1xuXHRcdFx0TC5Eb21VdGlsLmFkZENsYXNzKHRoaXMuX2NvbnRhaW5lciwgJ2xlYWZsZXQtcm91dGluZy1jb250YWluZXItaGlkZScpO1xuXHRcdH0sXG5cblx0XHRfdG9nZ2xlOiBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBjb2xsYXBzZWQgPSBMLkRvbVV0aWwuaGFzQ2xhc3ModGhpcy5fY29udGFpbmVyLCAnbGVhZmxldC1yb3V0aW5nLWNvbnRhaW5lci1oaWRlJyk7XG5cdFx0XHR0aGlzW2NvbGxhcHNlZCA/ICdzaG93JyA6ICdoaWRlJ10oKTtcblx0XHR9LFxuXG5cdFx0X2NyZWF0ZUFsdGVybmF0aXZlOiBmdW5jdGlvbihhbHQsIGkpIHtcblx0XHRcdHZhciBhbHREaXYgPSBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCAnbGVhZmxldC1yb3V0aW5nLWFsdCAnICtcblx0XHRcdFx0dGhpcy5vcHRpb25zLmFsdGVybmF0aXZlQ2xhc3NOYW1lICtcblx0XHRcdFx0KGkgPiAwID8gJyBsZWFmbGV0LXJvdXRpbmctYWx0LW1pbmltaXplZCAnICsgdGhpcy5vcHRpb25zLm1pbmltaXplZENsYXNzTmFtZSA6ICcnKSksXG5cdFx0XHRcdHRlbXBsYXRlID0gdGhpcy5vcHRpb25zLnN1bW1hcnlUZW1wbGF0ZSxcblx0XHRcdFx0ZGF0YSA9IEwuZXh0ZW5kKHtcblx0XHRcdFx0XHRuYW1lOiBhbHQubmFtZSxcblx0XHRcdFx0XHRkaXN0YW5jZTogdGhpcy5fZm9ybWF0dGVyLmZvcm1hdERpc3RhbmNlKGFsdC5zdW1tYXJ5LnRvdGFsRGlzdGFuY2UpLFxuXHRcdFx0XHRcdHRpbWU6IHRoaXMuX2Zvcm1hdHRlci5mb3JtYXRUaW1lKGFsdC5zdW1tYXJ5LnRvdGFsVGltZSlcblx0XHRcdFx0fSwgYWx0KTtcblx0XHRcdGFsdERpdi5pbm5lckhUTUwgPSB0eXBlb2YodGVtcGxhdGUpID09PSAnZnVuY3Rpb24nID8gdGVtcGxhdGUoZGF0YSkgOiBMLlV0aWwudGVtcGxhdGUodGVtcGxhdGUsIGRhdGEpO1xuXHRcdFx0TC5Eb21FdmVudC5hZGRMaXN0ZW5lcihhbHREaXYsICdjbGljaycsIHRoaXMuX29uQWx0Q2xpY2tlZCwgdGhpcyk7XG5cblx0XHRcdGFsdERpdi5hcHBlbmRDaGlsZCh0aGlzLl9jcmVhdGVJdGluZXJhcnlDb250YWluZXIoYWx0KSk7XG5cdFx0XHRyZXR1cm4gYWx0RGl2O1xuXHRcdH0sXG5cblx0XHRfY2xlYXJBbHRzOiBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBlbCA9IHRoaXMuX2FsdENvbnRhaW5lcjtcblx0XHRcdHdoaWxlIChlbCAmJiBlbC5maXJzdENoaWxkKSB7XG5cdFx0XHRcdGVsLnJlbW92ZUNoaWxkKGVsLmZpcnN0Q2hpbGQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9hbHRFbGVtZW50cyA9IFtdO1xuXHRcdH0sXG5cblxuXHRcdF9jcmVhdGVJdGluZXJhcnlDb250YWluZXI6IGZ1bmN0aW9uKHIpIHtcblx0XHRcdHZhciBjb250YWluZXIgPSB0aGlzLl9pdGluZXJhcnlCdWlsZGVyLmNyZWF0ZUNvbnRhaW5lcigpLFxuXHRcdFx0ICAgIHN0ZXBzID0gdGhpcy5faXRpbmVyYXJ5QnVpbGRlci5jcmVhdGVTdGVwc0NvbnRhaW5lcigpLFxuXHRcdFx0ICAgIGksXG5cdFx0XHQgICAgaW5zdHIsXG5cdFx0XHQgICAgc3RlcCxcblx0XHRcdCAgICBkaXN0YW5jZSxcblx0XHRcdCAgICB0ZXh0LFxuXHRcdFx0ICAgIGljb247XG5cblx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChzdGVwcyk7XG5cblx0XHRcdGZvciAoaSA9IDA7IGkgPCByLmluc3RydWN0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpbnN0ciA9IHIuaW5zdHJ1Y3Rpb25zW2ldO1xuXHRcdFx0XHR0ZXh0ID0gdGhpcy5fZm9ybWF0dGVyLmZvcm1hdEluc3RydWN0aW9uKGluc3RyLCBpKTtcblx0XHRcdFx0ZGlzdGFuY2UgPSB0aGlzLl9mb3JtYXR0ZXIuZm9ybWF0RGlzdGFuY2UoaW5zdHIuZGlzdGFuY2UpO1xuXHRcdFx0XHRpY29uID0gdGhpcy5fZm9ybWF0dGVyLmdldEljb25OYW1lKGluc3RyLCBpKTtcblx0XHRcdFx0c3RlcCA9IHRoaXMuX2l0aW5lcmFyeUJ1aWxkZXIuY3JlYXRlU3RlcCh0ZXh0LCBkaXN0YW5jZSwgaWNvbiwgc3RlcHMpO1xuXG5cdFx0XHRcdHRoaXMuX2FkZFJvd0xpc3RlbmVycyhzdGVwLCByLmNvb3JkaW5hdGVzW2luc3RyLmluZGV4XSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0fSxcblxuXHRcdF9hZGRSb3dMaXN0ZW5lcnM6IGZ1bmN0aW9uKHJvdywgY29vcmRpbmF0ZSkge1xuXHRcdFx0dmFyIF90aGlzID0gdGhpcyxcblx0XHRcdCAgICBtYXJrZXI7XG5cdFx0XHRMLkRvbUV2ZW50LmFkZExpc3RlbmVyKHJvdywgJ21vdXNlb3ZlcicsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRtYXJrZXIgPSBMLmNpcmNsZU1hcmtlcihjb29yZGluYXRlLFxuXHRcdFx0XHRcdF90aGlzLm9wdGlvbnMucG9pbnRNYXJrZXJTdHlsZSkuYWRkVG8oX3RoaXMuX21hcCk7XG5cdFx0XHR9KTtcblx0XHRcdEwuRG9tRXZlbnQuYWRkTGlzdGVuZXIocm93LCAnbW91c2VvdXQnLCBmdW5jdGlvbigpIHtcblx0XHRcdFx0aWYgKG1hcmtlcikge1xuXHRcdFx0XHRcdF90aGlzLl9tYXAucmVtb3ZlTGF5ZXIobWFya2VyKTtcblx0XHRcdFx0XHRtYXJrZXIgPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdEwuRG9tRXZlbnQuYWRkTGlzdGVuZXIocm93LCAnY2xpY2snLCBmdW5jdGlvbihlKSB7XG5cdFx0XHRcdF90aGlzLl9tYXAucGFuVG8oY29vcmRpbmF0ZSk7XG5cdFx0XHRcdEwuRG9tRXZlbnQuc3RvcFByb3BhZ2F0aW9uKGUpO1xuXHRcdFx0fSk7XG5cdFx0fSxcblxuXHRcdF9vbkFsdENsaWNrZWQ6IGZ1bmN0aW9uKGUpIHtcblx0XHRcdHZhciBhbHRFbGVtLFxuXHRcdFx0ICAgIGosXG5cdFx0XHQgICAgbixcblx0XHRcdCAgICBpc0N1cnJlbnRTZWxlY3Rpb24sXG5cdFx0XHQgICAgY2xhc3NGbjtcblxuXHRcdFx0YWx0RWxlbSA9IGUudGFyZ2V0IHx8IHdpbmRvdy5ldmVudC5zcmNFbGVtZW50O1xuXHRcdFx0d2hpbGUgKCFMLkRvbVV0aWwuaGFzQ2xhc3MoYWx0RWxlbSwgJ2xlYWZsZXQtcm91dGluZy1hbHQnKSkge1xuXHRcdFx0XHRhbHRFbGVtID0gYWx0RWxlbS5wYXJlbnRFbGVtZW50O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoTC5Eb21VdGlsLmhhc0NsYXNzKGFsdEVsZW0sICdsZWFmbGV0LXJvdXRpbmctYWx0LW1pbmltaXplZCcpKSB7XG5cdFx0XHRcdGZvciAoaiA9IDA7IGogPCB0aGlzLl9hbHRFbGVtZW50cy5sZW5ndGg7IGorKykge1xuXHRcdFx0XHRcdG4gPSB0aGlzLl9hbHRFbGVtZW50c1tqXTtcblx0XHRcdFx0XHRpc0N1cnJlbnRTZWxlY3Rpb24gPSBhbHRFbGVtID09PSBuO1xuXHRcdFx0XHRcdGNsYXNzRm4gPSBpc0N1cnJlbnRTZWxlY3Rpb24gPyAncmVtb3ZlQ2xhc3MnIDogJ2FkZENsYXNzJztcblx0XHRcdFx0XHRMLkRvbVV0aWxbY2xhc3NGbl0obiwgJ2xlYWZsZXQtcm91dGluZy1hbHQtbWluaW1pemVkJyk7XG5cdFx0XHRcdFx0aWYgKHRoaXMub3B0aW9ucy5taW5pbWl6ZWRDbGFzc05hbWUpIHtcblx0XHRcdFx0XHRcdEwuRG9tVXRpbFtjbGFzc0ZuXShuLCB0aGlzLm9wdGlvbnMubWluaW1pemVkQ2xhc3NOYW1lKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoaXNDdXJyZW50U2VsZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHQvLyBUT0RPOiBkb24ndCBmaXJlIGlmIHRoZSBjdXJyZW50bHkgYWN0aXZlIGlzIGNsaWNrZWRcblx0XHRcdFx0XHRcdHRoaXMuZmlyZSgncm91dGVzZWxlY3RlZCcsIHtyb3V0ZTogdGhpcy5fcm91dGVzW2pdfSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG4uc2Nyb2xsVG9wID0gMDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0TC5Eb21FdmVudC5zdG9wKGUpO1xuXHRcdH0sXG5cdH0pO1xuXG5cdEwuUm91dGluZy5pdGluZXJhcnkgPSBmdW5jdGlvbihvcHRpb25zKSB7XG5cdFx0cmV0dXJuIG5ldyBMLlJvdXRpbmcuSXRpbmVyYXJ5KG9wdGlvbnMpO1xuXHR9O1xuXG5cdG1vZHVsZS5leHBvcnRzID0gTC5Sb3V0aW5nO1xufSkoKTtcbiIsIihmdW5jdGlvbigpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG5cdHZhciBMID0gcmVxdWlyZSgnbGVhZmxldCcpO1xuXHRMLlJvdXRpbmcgPSBMLlJvdXRpbmcgfHwge307XG5cblx0TC5Sb3V0aW5nLkl0aW5lcmFyeUJ1aWxkZXIgPSBMLkNsYXNzLmV4dGVuZCh7XG5cdFx0b3B0aW9uczoge1xuXHRcdFx0Y29udGFpbmVyQ2xhc3NOYW1lOiAnJ1xuXHRcdH0sXG5cblx0XHRpbml0aWFsaXplOiBmdW5jdGlvbihvcHRpb25zKSB7XG5cdFx0XHRMLnNldE9wdGlvbnModGhpcywgb3B0aW9ucyk7XG5cdFx0fSxcblxuXHRcdGNyZWF0ZUNvbnRhaW5lcjogZnVuY3Rpb24oY2xhc3NOYW1lKSB7XG5cdFx0XHR2YXIgdGFibGUgPSBMLkRvbVV0aWwuY3JlYXRlKCd0YWJsZScsIGNsYXNzTmFtZSB8fCAnJyksXG5cdFx0XHRcdGNvbGdyb3VwID0gTC5Eb21VdGlsLmNyZWF0ZSgnY29sZ3JvdXAnLCAnJywgdGFibGUpO1xuXG5cdFx0XHRMLkRvbVV0aWwuY3JlYXRlKCdjb2wnLCAnbGVhZmxldC1yb3V0aW5nLWluc3RydWN0aW9uLWljb24nLCBjb2xncm91cCk7XG5cdFx0XHRMLkRvbVV0aWwuY3JlYXRlKCdjb2wnLCAnbGVhZmxldC1yb3V0aW5nLWluc3RydWN0aW9uLXRleHQnLCBjb2xncm91cCk7XG5cdFx0XHRMLkRvbVV0aWwuY3JlYXRlKCdjb2wnLCAnbGVhZmxldC1yb3V0aW5nLWluc3RydWN0aW9uLWRpc3RhbmNlJywgY29sZ3JvdXApO1xuXG5cdFx0XHRyZXR1cm4gdGFibGU7XG5cdFx0fSxcblxuXHRcdGNyZWF0ZVN0ZXBzQ29udGFpbmVyOiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBMLkRvbVV0aWwuY3JlYXRlKCd0Ym9keScsICcnKTtcblx0XHR9LFxuXG5cdFx0Y3JlYXRlU3RlcDogZnVuY3Rpb24odGV4dCwgZGlzdGFuY2UsIGljb24sIHN0ZXBzKSB7XG5cdFx0XHR2YXIgcm93ID0gTC5Eb21VdGlsLmNyZWF0ZSgndHInLCAnJywgc3RlcHMpLFxuXHRcdFx0XHRzcGFuLFxuXHRcdFx0XHR0ZDtcblx0XHRcdHRkID0gTC5Eb21VdGlsLmNyZWF0ZSgndGQnLCAnJywgcm93KTtcblx0XHRcdHNwYW4gPSBMLkRvbVV0aWwuY3JlYXRlKCdzcGFuJywgJ2xlYWZsZXQtcm91dGluZy1pY29uIGxlYWZsZXQtcm91dGluZy1pY29uLScraWNvbiwgdGQpO1xuXHRcdFx0dGQuYXBwZW5kQ2hpbGQoc3Bhbik7XG5cdFx0XHR0ZCA9IEwuRG9tVXRpbC5jcmVhdGUoJ3RkJywgJycsIHJvdyk7XG5cdFx0XHR0ZC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh0ZXh0KSk7XG5cdFx0XHR0ZCA9IEwuRG9tVXRpbC5jcmVhdGUoJ3RkJywgJycsIHJvdyk7XG5cdFx0XHR0ZC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShkaXN0YW5jZSkpO1xuXHRcdFx0cmV0dXJuIHJvdztcblx0XHR9XG5cdH0pO1xuXG5cdG1vZHVsZS5leHBvcnRzID0gTC5Sb3V0aW5nO1xufSkoKTtcbiIsIihmdW5jdGlvbigpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG5cdHZhciBMID0gcmVxdWlyZSgnbGVhZmxldCcpO1xuXG5cdEwuUm91dGluZyA9IEwuUm91dGluZyB8fCB7fTtcblxuXHRMLlJvdXRpbmcuTGluZSA9IEwuTGF5ZXJHcm91cC5leHRlbmQoe1xuXHRcdGluY2x1ZGVzOiBMLk1peGluLkV2ZW50cyxcblxuXHRcdG9wdGlvbnM6IHtcblx0XHRcdHN0eWxlczogW1xuXHRcdFx0XHR7Y29sb3I6ICdibGFjaycsIG9wYWNpdHk6IDAuMTUsIHdlaWdodDogOX0sXG5cdFx0XHRcdHtjb2xvcjogJ3doaXRlJywgb3BhY2l0eTogMC44LCB3ZWlnaHQ6IDZ9LFxuXHRcdFx0XHR7Y29sb3I6ICdyZWQnLCBvcGFjaXR5OiAxLCB3ZWlnaHQ6IDJ9XG5cdFx0XHRdLFxuXHRcdFx0bWlzc2luZ1JvdXRlU3R5bGVzOiBbXG5cdFx0XHRcdHtjb2xvcjogJ2JsYWNrJywgb3BhY2l0eTogMC4xNSwgd2VpZ2h0OiA3fSxcblx0XHRcdFx0e2NvbG9yOiAnd2hpdGUnLCBvcGFjaXR5OiAwLjYsIHdlaWdodDogNH0sXG5cdFx0XHRcdHtjb2xvcjogJ2dyYXknLCBvcGFjaXR5OiAwLjgsIHdlaWdodDogMiwgZGFzaEFycmF5OiAnNywxMid9XG5cdFx0XHRdLFxuXHRcdFx0YWRkV2F5cG9pbnRzOiB0cnVlLFxuXHRcdFx0ZXh0ZW5kVG9XYXlwb2ludHM6IHRydWUsXG5cdFx0XHRtaXNzaW5nUm91dGVUb2xlcmFuY2U6IDEwXG5cdFx0fSxcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uKHJvdXRlLCBvcHRpb25zKSB7XG5cdFx0XHRMLnNldE9wdGlvbnModGhpcywgb3B0aW9ucyk7XG5cdFx0XHRMLkxheWVyR3JvdXAucHJvdG90eXBlLmluaXRpYWxpemUuY2FsbCh0aGlzLCBvcHRpb25zKTtcblx0XHRcdHRoaXMuX3JvdXRlID0gcm91dGU7XG5cblx0XHRcdGlmICh0aGlzLm9wdGlvbnMuZXh0ZW5kVG9XYXlwb2ludHMpIHtcblx0XHRcdFx0dGhpcy5fZXh0ZW5kVG9XYXlwb2ludHMoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fYWRkU2VnbWVudChcblx0XHRcdFx0cm91dGUuY29vcmRpbmF0ZXMsXG5cdFx0XHRcdHRoaXMub3B0aW9ucy5zdHlsZXMsXG5cdFx0XHRcdHRoaXMub3B0aW9ucy5hZGRXYXlwb2ludHMpO1xuXHRcdH0sXG5cblx0XHRhZGRUbzogZnVuY3Rpb24obWFwKSB7XG5cdFx0XHRtYXAuYWRkTGF5ZXIodGhpcyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9LFxuXHRcdGdldEJvdW5kczogZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gTC5sYXRMbmdCb3VuZHModGhpcy5fcm91dGUuY29vcmRpbmF0ZXMpO1xuXHRcdH0sXG5cblx0XHRfZmluZFdheXBvaW50SW5kaWNlczogZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgd3BzID0gdGhpcy5fcm91dGUuaW5wdXRXYXlwb2ludHMsXG5cdFx0XHQgICAgaW5kaWNlcyA9IFtdLFxuXHRcdFx0ICAgIGk7XG5cdFx0XHRmb3IgKGkgPSAwOyBpIDwgd3BzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGluZGljZXMucHVzaCh0aGlzLl9maW5kQ2xvc2VzdFJvdXRlUG9pbnQod3BzW2ldLmxhdExuZykpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gaW5kaWNlcztcblx0XHR9LFxuXG5cdFx0X2ZpbmRDbG9zZXN0Um91dGVQb2ludDogZnVuY3Rpb24obGF0bG5nKSB7XG5cdFx0XHR2YXIgbWluRGlzdCA9IE51bWJlci5NQVhfVkFMVUUsXG5cdFx0XHRcdG1pbkluZGV4LFxuXHRcdFx0ICAgIGksXG5cdFx0XHQgICAgZDtcblxuXHRcdFx0Zm9yIChpID0gdGhpcy5fcm91dGUuY29vcmRpbmF0ZXMubGVuZ3RoIC0gMTsgaSA+PSAwIDsgaS0tKSB7XG5cdFx0XHRcdC8vIFRPRE86IG1heWJlIGRvIHRoaXMgaW4gcGl4ZWwgc3BhY2UgaW5zdGVhZD9cblx0XHRcdFx0ZCA9IGxhdGxuZy5kaXN0YW5jZVRvKHRoaXMuX3JvdXRlLmNvb3JkaW5hdGVzW2ldKTtcblx0XHRcdFx0aWYgKGQgPCBtaW5EaXN0KSB7XG5cdFx0XHRcdFx0bWluSW5kZXggPSBpO1xuXHRcdFx0XHRcdG1pbkRpc3QgPSBkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBtaW5JbmRleDtcblx0XHR9LFxuXG5cdFx0X2V4dGVuZFRvV2F5cG9pbnRzOiBmdW5jdGlvbigpIHtcblx0XHRcdHZhciB3cHMgPSB0aGlzLl9yb3V0ZS5pbnB1dFdheXBvaW50cyxcblx0XHRcdFx0d3BJbmRpY2VzID0gdGhpcy5fZ2V0V2F5cG9pbnRJbmRpY2VzKCksXG5cdFx0XHQgICAgaSxcblx0XHRcdCAgICB3cExhdExuZyxcblx0XHRcdCAgICByb3V0ZUNvb3JkO1xuXG5cdFx0XHRmb3IgKGkgPSAwOyBpIDwgd3BzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHdwTGF0TG5nID0gd3BzW2ldLmxhdExuZztcblx0XHRcdFx0cm91dGVDb29yZCA9IEwubGF0TG5nKHRoaXMuX3JvdXRlLmNvb3JkaW5hdGVzW3dwSW5kaWNlc1tpXV0pO1xuXHRcdFx0XHRpZiAod3BMYXRMbmcuZGlzdGFuY2VUbyhyb3V0ZUNvb3JkKSA+XG5cdFx0XHRcdFx0dGhpcy5vcHRpb25zLm1pc3NpbmdSb3V0ZVRvbGVyYW5jZSkge1xuXHRcdFx0XHRcdHRoaXMuX2FkZFNlZ21lbnQoW3dwTGF0TG5nLCByb3V0ZUNvb3JkXSxcblx0XHRcdFx0XHRcdHRoaXMub3B0aW9ucy5taXNzaW5nUm91dGVTdHlsZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF9hZGRTZWdtZW50OiBmdW5jdGlvbihjb29yZHMsIHN0eWxlcywgbW91c2VsaXN0ZW5lcikge1xuXHRcdFx0dmFyIGksXG5cdFx0XHRcdHBsO1xuXG5cdFx0XHRmb3IgKGkgPSAwOyBpIDwgc3R5bGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHBsID0gTC5wb2x5bGluZShjb29yZHMsIHN0eWxlc1tpXSk7XG5cdFx0XHRcdHRoaXMuYWRkTGF5ZXIocGwpO1xuXHRcdFx0XHRpZiAobW91c2VsaXN0ZW5lcikge1xuXHRcdFx0XHRcdHBsLm9uKCdtb3VzZWRvd24nLCB0aGlzLl9vbkxpbmVUb3VjaGVkLCB0aGlzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfZmluZE5lYXJlc3RXcEJlZm9yZTogZnVuY3Rpb24oaSkge1xuXHRcdFx0dmFyIHdwSW5kaWNlcyA9IHRoaXMuX2dldFdheXBvaW50SW5kaWNlcygpLFxuXHRcdFx0XHRqID0gd3BJbmRpY2VzLmxlbmd0aCAtIDE7XG5cdFx0XHR3aGlsZSAoaiA+PSAwICYmIHdwSW5kaWNlc1tqXSA+IGkpIHtcblx0XHRcdFx0ai0tO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gajtcblx0XHR9LFxuXG5cdFx0X29uTGluZVRvdWNoZWQ6IGZ1bmN0aW9uKGUpIHtcblx0XHRcdHZhciBhZnRlckluZGV4ID0gdGhpcy5fZmluZE5lYXJlc3RXcEJlZm9yZSh0aGlzLl9maW5kQ2xvc2VzdFJvdXRlUG9pbnQoZS5sYXRsbmcpKTtcblx0XHRcdHRoaXMuZmlyZSgnbGluZXRvdWNoZWQnLCB7XG5cdFx0XHRcdGFmdGVySW5kZXg6IGFmdGVySW5kZXgsXG5cdFx0XHRcdGxhdGxuZzogZS5sYXRsbmdcblx0XHRcdH0pO1xuXHRcdH0sXG5cblx0XHRfZ2V0V2F5cG9pbnRJbmRpY2VzOiBmdW5jdGlvbigpIHtcblx0XHRcdGlmICghdGhpcy5fd3BJbmRpY2VzKSB7XG5cdFx0XHRcdHRoaXMuX3dwSW5kaWNlcyA9IHRoaXMuX3JvdXRlLndheXBvaW50SW5kaWNlcyB8fCB0aGlzLl9maW5kV2F5cG9pbnRJbmRpY2VzKCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLl93cEluZGljZXM7XG5cdFx0fVxuXHR9KTtcblxuXHRMLlJvdXRpbmcubGluZSA9IGZ1bmN0aW9uKHJvdXRlLCBvcHRpb25zKSB7XG5cdFx0cmV0dXJuIG5ldyBMLlJvdXRpbmcuTGluZShyb3V0ZSwgb3B0aW9ucyk7XG5cdH07XG5cblx0bW9kdWxlLmV4cG9ydHMgPSBMLlJvdXRpbmc7XG59KSgpO1xuIiwiKGZ1bmN0aW9uKCkge1xuXHQndXNlIHN0cmljdCc7XG5cdEwuUm91dGluZyA9IEwuUm91dGluZyB8fCB7fTtcblxuXHRMLlJvdXRpbmcuTG9jYWxpemF0aW9uID0ge1xuXHRcdCdlbic6IHtcblx0XHRcdGRpcmVjdGlvbnM6IHtcblx0XHRcdFx0TjogJ25vcnRoJyxcblx0XHRcdFx0TkU6ICdub3J0aGVhc3QnLFxuXHRcdFx0XHRFOiAnZWFzdCcsXG5cdFx0XHRcdFNFOiAnc291dGhlYXN0Jyxcblx0XHRcdFx0UzogJ3NvdXRoJyxcblx0XHRcdFx0U1c6ICdzb3V0aHdlc3QnLFxuXHRcdFx0XHRXOiAnd2VzdCcsXG5cdFx0XHRcdE5XOiAnbm9ydGh3ZXN0J1xuXHRcdFx0fSxcblx0XHRcdGluc3RydWN0aW9uczoge1xuXHRcdFx0XHQvLyBpbnN0cnVjdGlvbiwgcG9zdGZpeCBpZiB0aGUgcm9hZCBpcyBuYW1lZFxuXHRcdFx0XHQnSGVhZCc6XG5cdFx0XHRcdFx0WydIZWFkIHtkaXJ9JywgJyBvbiB7cm9hZH0nXSxcblx0XHRcdFx0J0NvbnRpbnVlJzpcblx0XHRcdFx0XHRbJ0NvbnRpbnVlIHtkaXJ9JywgJyBvbiB7cm9hZH0nXSxcblx0XHRcdFx0J1NsaWdodFJpZ2h0Jzpcblx0XHRcdFx0XHRbJ1NsaWdodCByaWdodCcsICcgb250byB7cm9hZH0nXSxcblx0XHRcdFx0J1JpZ2h0Jzpcblx0XHRcdFx0XHRbJ1JpZ2h0JywgJyBvbnRvIHtyb2FkfSddLFxuXHRcdFx0XHQnU2hhcnBSaWdodCc6XG5cdFx0XHRcdFx0WydTaGFycCByaWdodCcsICcgb250byB7cm9hZH0nXSxcblx0XHRcdFx0J1R1cm5Bcm91bmQnOlxuXHRcdFx0XHRcdFsnVHVybiBhcm91bmQnXSxcblx0XHRcdFx0J1NoYXJwTGVmdCc6XG5cdFx0XHRcdFx0WydTaGFycCBsZWZ0JywgJyBvbnRvIHtyb2FkfSddLFxuXHRcdFx0XHQnTGVmdCc6XG5cdFx0XHRcdFx0WydMZWZ0JywgJyBvbnRvIHtyb2FkfSddLFxuXHRcdFx0XHQnU2xpZ2h0TGVmdCc6XG5cdFx0XHRcdFx0WydTbGlnaHQgbGVmdCcsICcgb250byB7cm9hZH0nXSxcblx0XHRcdFx0J1dheXBvaW50UmVhY2hlZCc6XG5cdFx0XHRcdFx0WydXYXlwb2ludCByZWFjaGVkJ10sXG5cdFx0XHRcdCdSb3VuZGFib3V0Jzpcblx0XHRcdFx0XHRbJ1Rha2UgdGhlIHtleGl0U3RyfSBleGl0IGluIHRoZSByb3VuZGFib3V0JywgJyBvbnRvIHtyb2FkfSddLFxuXHRcdFx0XHQnRGVzdGluYXRpb25SZWFjaGVkJzpcblx0XHRcdFx0XHRbJ0Rlc3RpbmF0aW9uIHJlYWNoZWQnXSxcblx0XHRcdH0sXG5cdFx0XHRmb3JtYXRPcmRlcjogZnVuY3Rpb24obikge1xuXHRcdFx0XHR2YXIgaSA9IG4gJSAxMCAtIDEsXG5cdFx0XHRcdHN1ZmZpeCA9IFsnc3QnLCAnbmQnLCAncmQnXTtcblxuXHRcdFx0XHRyZXR1cm4gc3VmZml4W2ldID8gbiArIHN1ZmZpeFtpXSA6IG4gKyAndGgnO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQnZGUnOiB7XG5cdFx0XHRkaXJlY3Rpb25zOiB7XG5cdFx0XHRcdE46ICdOb3JkZW4nLFxuXHRcdFx0XHRORTogJ05vcmRvc3RlbicsXG5cdFx0XHRcdEU6ICdPc3RlbicsXG5cdFx0XHRcdFNFOiAnU8O8ZG9zdGVuJyxcblx0XHRcdFx0UzogJ1PDvGRlbicsXG5cdFx0XHRcdFNXOiAnU8O8ZHdlc3RlbicsXG5cdFx0XHRcdFc6ICdXZXN0ZW4nLFxuXHRcdFx0XHROVzogJ05vcmR3ZXN0ZW4nXG5cdFx0XHR9LFxuXHRcdFx0aW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdC8vIGluc3RydWN0aW9uLCBwb3N0Zml4IGlmIHRoZSByb2FkIGlzIG5hbWVkXG5cdFx0XHRcdCdIZWFkJzpcblx0XHRcdFx0XHRbJ1JpY2h0dW5nIHtkaXJ9JywgJyBhdWYge3JvYWR9J10sXG5cdFx0XHRcdCdDb250aW51ZSc6XG5cdFx0XHRcdFx0WydHZXJhZGVhdXMgUmljaHR1bmcge2Rpcn0nLCAnIGF1ZiB7cm9hZH0nXSxcblx0XHRcdFx0J1NsaWdodFJpZ2h0Jzpcblx0XHRcdFx0XHRbJ0xlaWNodCByZWNodHMgYWJiaWVnZW4nLCAnIGF1ZiB7cm9hZH0nXSxcblx0XHRcdFx0J1JpZ2h0Jzpcblx0XHRcdFx0XHRbJ1JlY2h0cyBhYmJpZWdlbicsICcgYXVmIHtyb2FkfSddLFxuXHRcdFx0XHQnU2hhcnBSaWdodCc6XG5cdFx0XHRcdFx0WydTY2hhcmYgcmVjaHRzIGFiYmllZ2VuJywgJyBhdWYge3JvYWR9J10sXG5cdFx0XHRcdCdUdXJuQXJvdW5kJzpcblx0XHRcdFx0XHRbJ1dlbmRlbiddLFxuXHRcdFx0XHQnU2hhcnBMZWZ0Jzpcblx0XHRcdFx0XHRbJ1NjaGFyZiBsaW5rcyBhYmJpZWdlbicsICcgYXVmIHtyb2FkfSddLFxuXHRcdFx0XHQnTGVmdCc6XG5cdFx0XHRcdFx0WydMaW5rcyBhYmJpZWdlbicsICcgYXVmIHtyb2FkfSddLFxuXHRcdFx0XHQnU2xpZ2h0TGVmdCc6XG5cdFx0XHRcdFx0WydMZWljaHQgbGlua3MgYWJiaWVnZW4nLCAnIGF1ZiB7cm9hZH0nXSxcblx0XHRcdFx0J1dheXBvaW50UmVhY2hlZCc6XG5cdFx0XHRcdFx0Wydad2lzY2hlbmhhbHQgZXJyZWljaHQnXSxcblx0XHRcdFx0J1JvdW5kYWJvdXQnOlxuXHRcdFx0XHRcdFsnTmVobWVuIFNpZSBkaWUge2V4aXRTdHJ9IEF1c2ZhaHJ0IGltIEtyZWlzdmVya2VocicsICcgYXVmIHtyb2FkfSddLFxuXHRcdFx0XHQnRGVzdGluYXRpb25SZWFjaGVkJzpcblx0XHRcdFx0XHRbJ1NpZSBoYWJlbiBpaHIgWmllbCBlcnJlaWNodCddLFxuXHRcdFx0fSxcblx0XHRcdGZvcm1hdE9yZGVyOiBmdW5jdGlvbihuKSB7XG5cdFx0XHRcdHJldHVybiBuICsgJy4nO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQnc3YnOiB7XG5cdFx0XHRkaXJlY3Rpb25zOiB7XG5cdFx0XHRcdE46ICdub3JyJyxcblx0XHRcdFx0TkU6ICdub3Jkb3N0Jyxcblx0XHRcdFx0RTogJ8O2c3QnLFxuXHRcdFx0XHRTRTogJ3N5ZG9zdCcsXG5cdFx0XHRcdFM6ICdzeWQnLFxuXHRcdFx0XHRTVzogJ3N5ZHbDpHN0Jyxcblx0XHRcdFx0VzogJ3bDpHN0Jyxcblx0XHRcdFx0Tlc6ICdub3JkdsOkc3QnXG5cdFx0XHR9LFxuXHRcdFx0aW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdC8vIGluc3RydWN0aW9uLCBwb3N0Zml4IGlmIHRoZSByb2FkIGlzIG5hbWVkXG5cdFx0XHRcdCdIZWFkJzpcblx0XHRcdFx0XHRbJ8OFayDDpXQge2Rpcn0nLCAnIHDDpSB7cm9hZH0nXSxcblx0XHRcdFx0J0NvbnRpbnVlJzpcblx0XHRcdFx0XHRbJ0ZvcnRzw6R0dCB7ZGlyfScsICcgcMOlIHtyb2FkfSddLFxuXHRcdFx0XHQnU2xpZ2h0UmlnaHQnOlxuXHRcdFx0XHRcdFsnU3ZhZ3QgaMO2Z2VyJywgJyBww6Uge3JvYWR9J10sXG5cdFx0XHRcdCdSaWdodCc6XG5cdFx0XHRcdFx0WydTdsOkbmcgaMO2Z2VyJywgJyBww6Uge3JvYWR9J10sXG5cdFx0XHRcdCdTaGFycFJpZ2h0Jzpcblx0XHRcdFx0XHRbJ1NrYXJwdCBow7ZnZXInLCAnIHDDpSB7cm9hZH0nXSxcblx0XHRcdFx0J1R1cm5Bcm91bmQnOlxuXHRcdFx0XHRcdFsnVsOkbmQnXSxcblx0XHRcdFx0J1NoYXJwTGVmdCc6XG5cdFx0XHRcdFx0WydTa2FycHQgdsOkbnN0ZXInLCAnIHDDpSB7cm9hZH0nXSxcblx0XHRcdFx0J0xlZnQnOlxuXHRcdFx0XHRcdFsnU3bDpG5nIHbDpG5zdGVyJywgJyBww6Uge3JvYWR9J10sXG5cdFx0XHRcdCdTbGlnaHRMZWZ0Jzpcblx0XHRcdFx0XHRbJ1N2YWd0IHbDpG5zdGVyJywgJyBww6Uge3JvYWR9J10sXG5cdFx0XHRcdCdXYXlwb2ludFJlYWNoZWQnOlxuXHRcdFx0XHRcdFsnVmlhcHVua3QgbsOlZGQnXSxcblx0XHRcdFx0J1JvdW5kYWJvdXQnOlxuXHRcdFx0XHRcdFsnVGFnIHtleGl0U3RyfSBhdmZhcnRlbiBpIHJvbmRlbGxlbicsICcgdGlsbCB7cm9hZH0nXSxcblx0XHRcdFx0J0Rlc3RpbmF0aW9uUmVhY2hlZCc6XG5cdFx0XHRcdFx0WydGcmFtbWUgdmlkIHJlc2FucyBtw6VsJ10sXG5cdFx0XHR9LFxuXHRcdFx0Zm9ybWF0T3JkZXI6IGZ1bmN0aW9uKG4pIHtcblx0XHRcdFx0cmV0dXJuIFsnZsO2cnN0YScsICdhbmRyYScsICd0cmVkamUnLCAnZmrDpHJkZScsICdmZW10ZScsXG5cdFx0XHRcdFx0J3Nqw6R0dGUnLCAnc2p1bmRlJywgJ8OldHRvbmRlJywgJ25pb25kZScsICd0aW9uZGUnXG5cdFx0XHRcdFx0LyogQ2FuJ3QgcG9zc2libHkgYmUgbW9yZSB0aGFuIHRlbiBleGl0cywgY2FuIHRoZXJlPyAqL11bbiAtIDFdO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQnc3AnOiB7XG5cdFx0XHRkaXJlY3Rpb25zOiB7XG5cdFx0XHRcdE46ICdub3J0ZScsXG5cdFx0XHRcdE5FOiAnbm9yZXN0ZScsXG5cdFx0XHRcdEU6ICdlc3RlJyxcblx0XHRcdFx0U0U6ICdzdXJlc3RlJyxcblx0XHRcdFx0UzogJ3N1cicsXG5cdFx0XHRcdFNXOiAnc3Vyb2VzdGUnLFxuXHRcdFx0XHRXOiAnb2VzdGUnLFxuXHRcdFx0XHROVzogJ25vcm9lc3RlJ1xuXHRcdFx0fSxcblx0XHRcdGluc3RydWN0aW9uczoge1xuXHRcdFx0XHQvLyBpbnN0cnVjdGlvbiwgcG9zdGZpeCBpZiB0aGUgcm9hZCBpcyBuYW1lZFxuXHRcdFx0XHQnSGVhZCc6XG5cdFx0XHRcdFx0WydEZXJlY2hvIHtkaXJ9JywgJyBzb2JyZSB7cm9hZH0nXSxcblx0XHRcdFx0J0NvbnRpbnVlJzpcblx0XHRcdFx0XHRbJ0NvbnRpbnVhciB7ZGlyfScsICcgZW4ge3JvYWR9J10sXG5cdFx0XHRcdCdTbGlnaHRSaWdodCc6XG5cdFx0XHRcdFx0WydMZXZlIGdpcm8gYSBsYSBkZXJlY2hhJywgJyBzb2JyZSB7cm9hZH0nXSxcblx0XHRcdFx0J1JpZ2h0Jzpcblx0XHRcdFx0XHRbJ0RlcmVjaGEnLCAnIHNvYnJlIHtyb2FkfSddLFxuXHRcdFx0XHQnU2hhcnBSaWdodCc6XG5cdFx0XHRcdFx0WydHaXJvIHByb251bmNpYWRvIGEgbGEgZGVyZWNoYScsICcgc29icmUge3JvYWR9J10sXG5cdFx0XHRcdCdUdXJuQXJvdW5kJzpcblx0XHRcdFx0XHRbJ0RhciB2dWVsdGEnXSxcblx0XHRcdFx0J1NoYXJwTGVmdCc6XG5cdFx0XHRcdFx0WydHaXJvIHByb251bmNpYWRvIGEgbGEgaXpxdWllcmRhJywgJyBzb2JyZSB7cm9hZH0nXSxcblx0XHRcdFx0J0xlZnQnOlxuXHRcdFx0XHRcdFsnSXpxdWllcmRhJywgJyBlbiB7cm9hZH0nXSxcblx0XHRcdFx0J1NsaWdodExlZnQnOlxuXHRcdFx0XHRcdFsnTGV2ZSBnaXJvIGEgbGEgaXpxdWllcmRhJywgJyBlbiB7cm9hZH0nXSxcblx0XHRcdFx0J1dheXBvaW50UmVhY2hlZCc6XG5cdFx0XHRcdFx0WydMbGVnw7MgYSB1biBwdW50byBkZWwgY2FtaW5vJ10sXG5cdFx0XHRcdCdSb3VuZGFib3V0Jzpcblx0XHRcdFx0XHRbJ1RvbWFyIHtleGl0U3RyfSBzYWxpZGEgZW4gbGEgcm90b25kYScsICcgZW4ge3JvYWR9J10sXG5cdFx0XHRcdCdEZXN0aW5hdGlvblJlYWNoZWQnOlxuXHRcdFx0XHRcdFsnTGxlZ2FkYSBhIGRlc3Rpbm8nXSxcblx0XHRcdH0sXG5cdFx0XHRmb3JtYXRPcmRlcjogZnVuY3Rpb24obikge1xuXHRcdFx0XHRyZXR1cm4gbiArICfCuic7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnbmwnOiB7XG5cdFx0XHRkaXJlY3Rpb25zOiB7XG5cdFx0XHRcdE46ICdub29yZGVsaWprZScsXG5cdFx0XHRcdE5FOiAnbm9vcmRvb3N0ZWxpamtlJyxcblx0XHRcdFx0RTogJ29vc3RlbGlqa2UnLFxuXHRcdFx0XHRTRTogJ3p1aWRvb3N0ZWxpamtlJyxcblx0XHRcdFx0UzogJ3p1aWRlbGlqa2UnLFxuXHRcdFx0XHRTVzogJ3p1aWRld2VzdGVsaWprZScsXG5cdFx0XHRcdFc6ICd3ZXN0ZWxpamtlJyxcblx0XHRcdFx0Tlc6ICdub29yZHdlc3RlbGlqa2UnXG5cdFx0XHR9LFxuXHRcdFx0aW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdC8vIGluc3RydWN0aW9uLCBwb3N0Zml4IGlmIHRoZSByb2FkIGlzIG5hbWVkXG5cdFx0XHRcdCdIZWFkJzpcblx0XHRcdFx0XHRbJ1ZlcnRyZWsgaW4ge2Rpcn0gcmljaHRpbmcnLCAnIGRlIHtyb2FkfSBvcCddLFxuXHRcdFx0XHQnQ29udGludWUnOlxuXHRcdFx0XHRcdFsnR2EgaW4ge2Rpcn0gcmljaHRpbmcnLCAnIGRlIHtyb2FkfSBvcCddLFxuXHRcdFx0XHQnU2xpZ2h0UmlnaHQnOlxuXHRcdFx0XHRcdFsnVm9sZyBkZSB3ZWcgbmFhciByZWNodHMnLCAnIGRlIHtyb2FkfSBvcCddLFxuXHRcdFx0XHQnUmlnaHQnOlxuXHRcdFx0XHRcdFsnR2EgcmVjaHRzYWYnLCAnIGRlIHtyb2FkfSBvcCddLFxuXHRcdFx0XHQnU2hhcnBSaWdodCc6XG5cdFx0XHRcdFx0WydHYSBzY2hlcnBlIGJvY2h0IG5hYXIgcmVjaHRzJywgJyBkZSB7cm9hZH0gb3AnXSxcblx0XHRcdFx0J1R1cm5Bcm91bmQnOlxuXHRcdFx0XHRcdFsnS2VlciBvbSddLFxuXHRcdFx0XHQnU2hhcnBMZWZ0Jzpcblx0XHRcdFx0XHRbJ0dhIHNjaGVycGUgYm9jaHQgbmFhciBsaW5rcycsICcgZGUge3JvYWR9IG9wJ10sXG5cdFx0XHRcdCdMZWZ0Jzpcblx0XHRcdFx0XHRbJ0dhIGxpbmtzYWYnLCAnIGRlIHtyb2FkfSBvcCddLFxuXHRcdFx0XHQnU2xpZ2h0TGVmdCc6XG5cdFx0XHRcdFx0WydWb2xnIGRlIHdlZyBuYWFyIGxpbmtzJywgJyBkZSB7cm9hZH0gb3AnXSxcblx0XHRcdFx0J1dheXBvaW50UmVhY2hlZCc6XG5cdFx0XHRcdFx0WydBYW5nZWtvbWVuIGJpaiB0dXNzZW5wdW50J10sXG5cdFx0XHRcdCdSb3VuZGFib3V0Jzpcblx0XHRcdFx0XHRbJ05lZW0gZGUge2V4aXRTdHJ9IGFmc2xhZyBvcCBkZSByb3RvbmRlJywgJyBkZSB7cm9hZH0gb3AnXSxcblx0XHRcdFx0J0Rlc3RpbmF0aW9uUmVhY2hlZCc6XG5cdFx0XHRcdFx0WydBYW5nZWtvbWVuIG9wIGVpbmRwdW50J10sXG5cdFx0XHR9LFxuXHRcdFx0Zm9ybWF0T3JkZXI6IGZ1bmN0aW9uKG4pIHtcblx0XHRcdFx0aWYgKG4gPT0gMSB8fCBuID49IDIwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG4gKyBcInN0ZVwiO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBuICsgXCJkZVwiO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnZnInOiB7XG5cdFx0XHRkaXJlY3Rpb25zOiB7XG5cdFx0XHRcdE46ICdub3JkJyxcblx0XHRcdFx0TkU6ICdub3JkLWVzdCcsXG5cdFx0XHRcdEU6ICdlc3QnLFxuXHRcdFx0XHRTRTogJ3N1ZC1lc3QnLFxuXHRcdFx0XHRTOiAnc3VkJyxcblx0XHRcdFx0U1c6ICdzdWQtb3Vlc3QnLFxuXHRcdFx0XHRXOiAnb3Vlc3QnLFxuXHRcdFx0XHROVzogJ25vcmQtb3Vlc3QnXG5cdFx0XHR9LFxuXHRcdFx0aW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdC8vIGluc3RydWN0aW9uLCBwb3N0Zml4IGlmIHRoZSByb2FkIGlzIG5hbWVkXG5cdFx0XHRcdCdIZWFkJzpcblx0XHRcdFx0XHRbJ1RvdXQgZHJvaXQgYXUge2Rpcn0nLCAnIHN1ciB7cm9hZH0nXSxcblx0XHRcdFx0J0NvbnRpbnVlJzpcblx0XHRcdFx0XHRbJ0NvbnRpbnVlciBhdSB7ZGlyfScsICcgc3VyIHtyb2FkfSddLFxuXHRcdFx0XHQnU2xpZ2h0UmlnaHQnOlxuXHRcdFx0XHRcdFsnTMOpZ8OocmVtZW50IMOgIGRyb2l0ZScsICcgc3VyIHtyb2FkfSddLFxuXHRcdFx0XHQnUmlnaHQnOlxuXHRcdFx0XHRcdFsnQSBkcm9pdGUnLCAnIHN1ciB7cm9hZH0nXSxcblx0XHRcdFx0J1NoYXJwUmlnaHQnOlxuXHRcdFx0XHRcdFsnQ29tcGzDqHRlbWVudCDDoCBkcm9pdGUnLCAnIHN1ciB7cm9hZH0nXSxcblx0XHRcdFx0J1R1cm5Bcm91bmQnOlxuXHRcdFx0XHRcdFsnRmFpcmUgZGVtaS10b3VyJ10sXG5cdFx0XHRcdCdTaGFycExlZnQnOlxuXHRcdFx0XHRcdFsnQ29tcGzDqHRlbWVudCDDoCBnYXVjaGUnLCAnIHN1ciB7cm9hZH0nXSxcblx0XHRcdFx0J0xlZnQnOlxuXHRcdFx0XHRcdFsnQSBnYXVjaGUnLCAnIHN1ciB7cm9hZH0nXSxcblx0XHRcdFx0J1NsaWdodExlZnQnOlxuXHRcdFx0XHRcdFsnTMOpZ8OocmVtZW50IMOgIGdhdWNoZScsICcgc3VyIHtyb2FkfSddLFxuXHRcdFx0XHQnV2F5cG9pbnRSZWFjaGVkJzpcblx0XHRcdFx0XHRbJ1BvaW50IGRcXCfDqXRhcGUgYXR0ZWludCddLFxuXHRcdFx0XHQnUm91bmRhYm91dCc6XG5cdFx0XHRcdFx0WydBdSByb25kLXBvaW50LCBwcmVuZXogbGEge2V4aXRTdHJ9IHNvcnRpZScsICcgc3VyIHtyb2FkfSddLFxuXHRcdFx0XHQnRGVzdGluYXRpb25SZWFjaGVkJzpcblx0XHRcdFx0XHRbJ0Rlc3RpbmF0aW9uIGF0dGVpbnRlJ10sXG5cdFx0XHR9LFxuXHRcdFx0Zm9ybWF0T3JkZXI6IGZ1bmN0aW9uKG4pIHtcblx0XHRcdFx0cmV0dXJuIG4gKyAnwronO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRtb2R1bGUuZXhwb3J0cyA9IEwuUm91dGluZztcbn0pKCk7XG4iLCIoZnVuY3Rpb24oKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuXHR2YXIgTCA9IHJlcXVpcmUoJ2xlYWZsZXQnKSxcblx0XHRjb3JzbGl0ZSA9IHJlcXVpcmUoJ2NvcnNsaXRlJyksXG5cdFx0cG9seWxpbmUgPSByZXF1aXJlKCdwb2x5bGluZScpO1xuXG5cdC8vIElnbm9yZSBjYW1lbGNhc2UgbmFtaW5nIGZvciB0aGlzIGZpbGUsIHNpbmNlIE9TUk0ncyBBUEkgdXNlc1xuXHQvLyB1bmRlcnNjb3Jlcy5cblx0LyoganNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cblxuXHRMLlJvdXRpbmcgPSBMLlJvdXRpbmcgfHwge307XG5cdEwuZXh0ZW5kKEwuUm91dGluZywgcmVxdWlyZSgnLi9MLlJvdXRpbmcuV2F5cG9pbnQnKSk7XG5cblx0TC5Sb3V0aW5nLk9TUk0gPSBMLkNsYXNzLmV4dGVuZCh7XG5cdFx0b3B0aW9uczoge1xuXHRcdFx0c2VydmljZVVybDogJy8vcm91dGVyLnByb2plY3Qtb3NybS5vcmcvdmlhcm91dGUnLFxuXHRcdFx0dGltZW91dDogMzAgKiAxMDAwXG5cdFx0fSxcblxuXHRcdGluaXRpYWxpemU6IGZ1bmN0aW9uKG9wdGlvbnMpIHtcblx0XHRcdEwuVXRpbC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xuXHRcdFx0dGhpcy5faGludHMgPSB7XG5cdFx0XHRcdGxvY2F0aW9uczoge31cblx0XHRcdH07XG5cdFx0fSxcblxuXHRcdHJvdXRlOiBmdW5jdGlvbih3YXlwb2ludHMsIGNhbGxiYWNrLCBjb250ZXh0LCBvcHRpb25zKSB7XG5cdFx0XHR2YXIgdGltZWRPdXQgPSBmYWxzZSxcblx0XHRcdFx0d3BzID0gW10sXG5cdFx0XHRcdHVybCxcblx0XHRcdFx0dGltZXIsXG5cdFx0XHRcdHdwLFxuXHRcdFx0XHRpO1xuXG5cdFx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblx0XHRcdHVybCA9IHRoaXMuYnVpbGRSb3V0ZVVybCh3YXlwb2ludHMsIG9wdGlvbnMpO1xuXG5cdFx0XHR0aW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHRpbWVkT3V0ID0gdHJ1ZTtcblx0XHRcdFx0Y2FsbGJhY2suY2FsbChjb250ZXh0IHx8IGNhbGxiYWNrLCB7XG5cdFx0XHRcdFx0c3RhdHVzOiAtMSxcblx0XHRcdFx0XHRtZXNzYWdlOiAnT1NSTSByZXF1ZXN0IHRpbWVkIG91dC4nXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgdGhpcy5vcHRpb25zLnRpbWVvdXQpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYSBjb3B5IG9mIHRoZSB3YXlwb2ludHMsIHNpbmNlIHRoZXlcblx0XHRcdC8vIG1pZ2h0IG90aGVyd2lzZSBiZSBhc3luY2hyb25vdXNseSBtb2RpZmllZCB3aGlsZVxuXHRcdFx0Ly8gdGhlIHJlcXVlc3QgaXMgYmVpbmcgcHJvY2Vzc2VkLlxuXHRcdFx0Zm9yIChpID0gMDsgaSA8IHdheXBvaW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHR3cCA9IHdheXBvaW50c1tpXTtcblx0XHRcdFx0d3BzLnB1c2gobmV3IEwuUm91dGluZy5XYXlwb2ludCh3cC5sYXRMbmcsIHdwLm5hbWUsIHdwLm9wdGlvbnMpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29yc2xpdGUodXJsLCBMLmJpbmQoZnVuY3Rpb24oZXJyLCByZXNwKSB7XG5cdFx0XHRcdHZhciBkYXRhO1xuXG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0XHRcdGlmICghdGltZWRPdXQpIHtcblx0XHRcdFx0XHRpZiAoIWVycikge1xuXHRcdFx0XHRcdFx0ZGF0YSA9IEpTT04ucGFyc2UocmVzcC5yZXNwb25zZVRleHQpO1xuXHRcdFx0XHRcdFx0dGhpcy5fcm91dGVEb25lKGRhdGEsIHdwcywgY2FsbGJhY2ssIGNvbnRleHQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjYWxsYmFjay5jYWxsKGNvbnRleHQgfHwgY2FsbGJhY2ssIHtcblx0XHRcdFx0XHRcdFx0c3RhdHVzOiAtMSxcblx0XHRcdFx0XHRcdFx0bWVzc2FnZTogJ0hUVFAgcmVxdWVzdCBmYWlsZWQ6ICcgKyBlcnJcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSwgdGhpcykpO1xuXG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9LFxuXG5cdFx0X3JvdXRlRG9uZTogZnVuY3Rpb24ocmVzcG9uc2UsIGlucHV0V2F5cG9pbnRzLCBjYWxsYmFjaywgY29udGV4dCkge1xuXHRcdFx0dmFyIGNvb3JkaW5hdGVzLFxuXHRcdFx0ICAgIGFsdHMsXG5cdFx0XHQgICAgYWN0dWFsV2F5cG9pbnRzLFxuXHRcdFx0ICAgIGk7XG5cblx0XHRcdGNvbnRleHQgPSBjb250ZXh0IHx8IGNhbGxiYWNrO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gMCkge1xuXHRcdFx0XHRjYWxsYmFjay5jYWxsKGNvbnRleHQsIHtcblx0XHRcdFx0XHRzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cyxcblx0XHRcdFx0XHRtZXNzYWdlOiByZXNwb25zZS5zdGF0dXNfbWVzc2FnZVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb29yZGluYXRlcyA9IHBvbHlsaW5lLmRlY29kZShyZXNwb25zZS5yb3V0ZV9nZW9tZXRyeSwgNik7XG5cdFx0XHRhY3R1YWxXYXlwb2ludHMgPSB0aGlzLl90b1dheXBvaW50cyhpbnB1dFdheXBvaW50cywgcmVzcG9uc2UudmlhX3BvaW50cyk7XG5cdFx0XHRhbHRzID0gW3tcblx0XHRcdFx0bmFtZTogcmVzcG9uc2Uucm91dGVfbmFtZS5qb2luKCcsICcpLFxuXHRcdFx0XHRjb29yZGluYXRlczogY29vcmRpbmF0ZXMsXG5cdFx0XHRcdGluc3RydWN0aW9uczogcmVzcG9uc2Uucm91dGVfaW5zdHJ1Y3Rpb25zID8gdGhpcy5fY29udmVydEluc3RydWN0aW9ucyhyZXNwb25zZS5yb3V0ZV9pbnN0cnVjdGlvbnMpIDogW10sXG5cdFx0XHRcdHN1bW1hcnk6IHJlc3BvbnNlLnJvdXRlX3N1bW1hcnkgPyB0aGlzLl9jb252ZXJ0U3VtbWFyeShyZXNwb25zZS5yb3V0ZV9zdW1tYXJ5KSA6IFtdLFxuXHRcdFx0XHRpbnB1dFdheXBvaW50czogaW5wdXRXYXlwb2ludHMsXG5cdFx0XHRcdHdheXBvaW50czogYWN0dWFsV2F5cG9pbnRzLFxuXHRcdFx0XHR3YXlwb2ludEluZGljZXM6IHRoaXMuX2NsYW1wSW5kaWNlcyhyZXNwb25zZS52aWFfaW5kaWNlcywgY29vcmRpbmF0ZXMpXG5cdFx0XHR9XTtcblxuXHRcdFx0aWYgKHJlc3BvbnNlLmFsdGVybmF0aXZlX2dlb21ldHJpZXMpIHtcblx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IHJlc3BvbnNlLmFsdGVybmF0aXZlX2dlb21ldHJpZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRjb29yZGluYXRlcyA9IHBvbHlsaW5lLmRlY29kZShyZXNwb25zZS5hbHRlcm5hdGl2ZV9nZW9tZXRyaWVzW2ldLCA2KTtcblx0XHRcdFx0XHRhbHRzLnB1c2goe1xuXHRcdFx0XHRcdFx0bmFtZTogcmVzcG9uc2UuYWx0ZXJuYXRpdmVfbmFtZXNbaV0uam9pbignLCAnKSxcblx0XHRcdFx0XHRcdGNvb3JkaW5hdGVzOiBjb29yZGluYXRlcyxcblx0XHRcdFx0XHRcdGluc3RydWN0aW9uczogcmVzcG9uc2UuYWx0ZXJuYXRpdmVfaW5zdHJ1Y3Rpb25zW2ldID8gdGhpcy5fY29udmVydEluc3RydWN0aW9ucyhyZXNwb25zZS5hbHRlcm5hdGl2ZV9pbnN0cnVjdGlvbnNbaV0pIDogW10sXG5cdFx0XHRcdFx0XHRzdW1tYXJ5OiByZXNwb25zZS5hbHRlcm5hdGl2ZV9zdW1tYXJpZXNbaV0gPyB0aGlzLl9jb252ZXJ0U3VtbWFyeShyZXNwb25zZS5hbHRlcm5hdGl2ZV9zdW1tYXJpZXNbaV0pIDogW10sXG5cdFx0XHRcdFx0XHRpbnB1dFdheXBvaW50czogaW5wdXRXYXlwb2ludHMsXG5cdFx0XHRcdFx0XHR3YXlwb2ludHM6IGFjdHVhbFdheXBvaW50cyxcblx0XHRcdFx0XHRcdHdheXBvaW50SW5kaWNlczogdGhpcy5fY2xhbXBJbmRpY2VzKHJlc3BvbnNlLmFsdGVybmF0aXZlX2dlb21ldHJpZXMubGVuZ3RoID09PSAxID9cblx0XHRcdFx0XHRcdFx0Ly8gVW5zdXJlIGlmIHRoaXMgaXMgYSBidWcgaW4gT1NSTSBvciBub3QsIGJ1dCBhbHRlcm5hdGl2ZV9pbmRpY2VzXG5cdFx0XHRcdFx0XHRcdC8vIGRvZXMgbm90IGFwcGVhciB0byBiZSBhbiBhcnJheSBvZiBhcnJheXMsIGF0IGxlYXN0IG5vdCB3aGVuIHRoZXJlIGlzXG5cdFx0XHRcdFx0XHRcdC8vIGEgc2luZ2xlIGFsdGVybmF0aXZlIHJvdXRlLlxuXHRcdFx0XHRcdFx0XHRyZXNwb25zZS5hbHRlcm5hdGl2ZV9pbmRpY2VzIDogcmVzcG9uc2UuYWx0ZXJuYXRpdmVfaW5kaWNlc1tpXSxcblx0XHRcdFx0XHRcdFx0Y29vcmRpbmF0ZXMpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gb25seSB2ZXJzaW9ucyA8NC41LjAgd2lsbCBzdXBwb3J0IHRoaXMgZmxhZ1xuXHRcdFx0aWYgKHJlc3BvbnNlLmhpbnRfZGF0YSkge1xuXHRcdFx0XHR0aGlzLl9zYXZlSGludERhdGEocmVzcG9uc2UuaGludF9kYXRhLCBpbnB1dFdheXBvaW50cyk7XG5cdFx0XHR9XG5cdFx0XHRjYWxsYmFjay5jYWxsKGNvbnRleHQsIG51bGwsIGFsdHMpO1xuXHRcdH0sXG5cblx0XHRfdG9XYXlwb2ludHM6IGZ1bmN0aW9uKGlucHV0V2F5cG9pbnRzLCB2aWFzKSB7XG5cdFx0XHR2YXIgd3BzID0gW10sXG5cdFx0XHQgICAgaTtcblx0XHRcdGZvciAoaSA9IDA7IGkgPCB2aWFzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHdwcy5wdXNoKEwuUm91dGluZy53YXlwb2ludChMLmxhdExuZyh2aWFzW2ldKSxcblx0XHRcdFx0ICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0V2F5cG9pbnRzW2ldLm5hbWUsXG5cdFx0XHRcdCAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnB1dFdheXBvaW50c1tpXS5vcHRpb25zKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB3cHM7XG5cdFx0fSxcblxuXHRcdGJ1aWxkUm91dGVVcmw6IGZ1bmN0aW9uKHdheXBvaW50cywgb3B0aW9ucykge1xuXHRcdFx0dmFyIGxvY3MgPSBbXSxcblx0XHRcdFx0d3AsXG5cdFx0XHQgICAgY29tcHV0ZUluc3RydWN0aW9ucyxcblx0XHRcdCAgICBjb21wdXRlQWx0ZXJuYXRpdmUsXG5cdFx0XHQgICAgbG9jYXRpb25LZXksXG5cdFx0XHQgICAgaGludDtcblxuXHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCB3YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0d3AgPSB3YXlwb2ludHNbaV07XG5cdFx0XHRcdGxvY2F0aW9uS2V5ID0gdGhpcy5fbG9jYXRpb25LZXkod3AubGF0TG5nKTtcblx0XHRcdFx0bG9jcy5wdXNoKCdsb2M9JyArIGxvY2F0aW9uS2V5KTtcblxuXHRcdFx0XHRoaW50ID0gdGhpcy5faGludHMubG9jYXRpb25zW2xvY2F0aW9uS2V5XTtcblx0XHRcdFx0aWYgKGhpbnQpIHtcblx0XHRcdFx0XHRsb2NzLnB1c2goJ2hpbnQ9JyArIGhpbnQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHdwLm9wdGlvbnMgJiYgd3Aub3B0aW9ucy5hbGxvd1VUdXJuKSB7XG5cdFx0XHRcdFx0bG9jcy5wdXNoKCd1PXRydWUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb21wdXRlQWx0ZXJuYXRpdmUgPSBjb21wdXRlSW5zdHJ1Y3Rpb25zID1cblx0XHRcdFx0IShvcHRpb25zICYmIG9wdGlvbnMuZ2VvbWV0cnlPbmx5KTtcblxuXHRcdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5zZXJ2aWNlVXJsICsgJz8nICtcblx0XHRcdFx0J2luc3RydWN0aW9ucz0nICsgY29tcHV0ZUluc3RydWN0aW9ucyArICcmJyArXG5cdFx0XHRcdCdhbHQ9JyArIGNvbXB1dGVBbHRlcm5hdGl2ZSArICcmJyArXG5cdFx0XHRcdChvcHRpb25zLnogPyAnej0nICsgb3B0aW9ucy56ICsgJyYnIDogJycpICtcblx0XHRcdFx0bG9jcy5qb2luKCcmJykgK1xuXHRcdFx0XHQodGhpcy5faGludHMuY2hlY2tzdW0gIT09IHVuZGVmaW5lZCA/ICcmY2hlY2tzdW09JyArIHRoaXMuX2hpbnRzLmNoZWNrc3VtIDogJycpICtcblx0XHRcdFx0KG9wdGlvbnMuZmlsZWZvcm1hdCA/ICcmb3V0cHV0PScgKyBvcHRpb25zLmZpbGVmb3JtYXQgOiAnJykgK1xuXHRcdFx0XHQob3B0aW9ucy5hbGxvd1VUdXJucyA/ICcmdXR1cm5zPScgKyBvcHRpb25zLmFsbG93VVR1cm5zIDogJycpO1xuXHRcdH0sXG5cblx0XHRfbG9jYXRpb25LZXk6IGZ1bmN0aW9uKGxvY2F0aW9uKSB7XG5cdFx0XHRyZXR1cm4gbG9jYXRpb24ubGF0ICsgJywnICsgbG9jYXRpb24ubG5nO1xuXHRcdH0sXG5cblx0XHRfc2F2ZUhpbnREYXRhOiBmdW5jdGlvbihoaW50RGF0YSwgd2F5cG9pbnRzKSB7XG5cdFx0XHR2YXIgbG9jO1xuXHRcdFx0dGhpcy5faGludHMgPSB7XG5cdFx0XHRcdGNoZWNrc3VtOiBoaW50RGF0YS5jaGVja3N1bSxcblx0XHRcdFx0bG9jYXRpb25zOiB7fVxuXHRcdFx0fTtcblx0XHRcdGZvciAodmFyIGkgPSBoaW50RGF0YS5sb2NhdGlvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0bG9jID0gd2F5cG9pbnRzW2ldLmxhdExuZztcblx0XHRcdFx0dGhpcy5faGludHMubG9jYXRpb25zW3RoaXMuX2xvY2F0aW9uS2V5KGxvYyldID0gaGludERhdGEubG9jYXRpb25zW2ldO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQvLyBBZGFwdGVkIGZyb21cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vRGVubmlzU2NoaWVmZXIvUHJvamVjdC1PU1JNLVdlYi9ibG9iL2RldmVsb3AvV2ViQ29udGVudC9yb3V0aW5nL09TUk0uUm91dGluZ0dlb21ldHJ5LmpzXG5cdFx0X2RlY29kZTogZnVuY3Rpb24oZW5jb2RlZCwgcHJlY2lzaW9uKSB7XG5cdFx0XHR2YXIgbGVuID0gZW5jb2RlZC5sZW5ndGgsXG5cdFx0XHQgICAgaW5kZXg9MCxcblx0XHRcdCAgICBsYXQ9MCxcblx0XHRcdCAgICBsbmcgPSAwLFxuXHRcdFx0ICAgIGFycmF5ID0gW107XG5cblx0XHRcdHByZWNpc2lvbiA9IE1hdGgucG93KDEwLCAtcHJlY2lzaW9uKTtcblxuXHRcdFx0d2hpbGUgKGluZGV4IDwgbGVuKSB7XG5cdFx0XHRcdHZhciBiLFxuXHRcdFx0XHQgICAgc2hpZnQgPSAwLFxuXHRcdFx0XHQgICAgcmVzdWx0ID0gMDtcblx0XHRcdFx0ZG8ge1xuXHRcdFx0XHRcdGIgPSBlbmNvZGVkLmNoYXJDb2RlQXQoaW5kZXgrKykgLSA2Mztcblx0XHRcdFx0XHRyZXN1bHQgfD0gKGIgJiAweDFmKSA8PCBzaGlmdDtcblx0XHRcdFx0XHRzaGlmdCArPSA1O1xuXHRcdFx0XHR9IHdoaWxlIChiID49IDB4MjApO1xuXHRcdFx0XHR2YXIgZGxhdCA9ICgocmVzdWx0ICYgMSkgPyB+KHJlc3VsdCA+PiAxKSA6IChyZXN1bHQgPj4gMSkpO1xuXHRcdFx0XHRsYXQgKz0gZGxhdDtcblx0XHRcdFx0c2hpZnQgPSAwO1xuXHRcdFx0XHRyZXN1bHQgPSAwO1xuXHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0YiA9IGVuY29kZWQuY2hhckNvZGVBdChpbmRleCsrKSAtIDYzO1xuXHRcdFx0XHRcdHJlc3VsdCB8PSAoYiAmIDB4MWYpIDw8IHNoaWZ0O1xuXHRcdFx0XHRcdHNoaWZ0ICs9IDU7XG5cdFx0XHRcdH0gd2hpbGUgKGIgPj0gMHgyMCk7XG5cdFx0XHRcdHZhciBkbG5nID0gKChyZXN1bHQgJiAxKSA/IH4ocmVzdWx0ID4+IDEpIDogKHJlc3VsdCA+PiAxKSk7XG5cdFx0XHRcdGxuZyArPSBkbG5nO1xuXHRcdFx0XHQvL2FycmF5LnB1c2goIHtsYXQ6IGxhdCAqIHByZWNpc2lvbiwgbG5nOiBsbmcgKiBwcmVjaXNpb259ICk7XG5cdFx0XHRcdGFycmF5LnB1c2goIFtsYXQgKiBwcmVjaXNpb24sIGxuZyAqIHByZWNpc2lvbl0gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhcnJheTtcblx0XHR9LFxuXG5cdFx0X2NvbnZlcnRTdW1tYXJ5OiBmdW5jdGlvbihvc3JtU3VtbWFyeSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dG90YWxEaXN0YW5jZTogb3NybVN1bW1hcnkudG90YWxfZGlzdGFuY2UsXG5cdFx0XHRcdHRvdGFsVGltZTogb3NybVN1bW1hcnkudG90YWxfdGltZVxuXHRcdFx0fTtcblx0XHR9LFxuXG5cdFx0X2NvbnZlcnRJbnN0cnVjdGlvbnM6IGZ1bmN0aW9uKG9zcm1JbnN0cnVjdGlvbnMpIHtcblx0XHRcdHZhciByZXN1bHQgPSBbXSxcblx0XHRcdCAgICBpLFxuXHRcdFx0ICAgIGluc3RyLFxuXHRcdFx0ICAgIHR5cGUsXG5cdFx0XHQgICAgZHJpdmVEaXI7XG5cblx0XHRcdGZvciAoaSA9IDA7IGkgPCBvc3JtSW5zdHJ1Y3Rpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGluc3RyID0gb3NybUluc3RydWN0aW9uc1tpXTtcblx0XHRcdFx0dHlwZSA9IHRoaXMuX2RyaXZpbmdEaXJlY3Rpb25UeXBlKGluc3RyWzBdKTtcblx0XHRcdFx0ZHJpdmVEaXIgPSBpbnN0clswXS5zcGxpdCgnLScpO1xuXHRcdFx0XHRpZiAodHlwZSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdHR5cGU6IHR5cGUsXG5cdFx0XHRcdFx0XHRkaXN0YW5jZTogaW5zdHJbMl0sXG5cdFx0XHRcdFx0XHR0aW1lOiBpbnN0cls0XSxcblx0XHRcdFx0XHRcdHJvYWQ6IGluc3RyWzFdLFxuXHRcdFx0XHRcdFx0ZGlyZWN0aW9uOiBpbnN0cls2XSxcblx0XHRcdFx0XHRcdGV4aXQ6IGRyaXZlRGlyLmxlbmd0aCA+IDEgPyBkcml2ZURpclsxXSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGluZGV4OiBpbnN0clszXVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSxcblxuXHRcdF9kcml2aW5nRGlyZWN0aW9uVHlwZTogZnVuY3Rpb24oZCkge1xuXHRcdFx0c3dpdGNoIChwYXJzZUludChkLCAxMCkpIHtcblx0XHRcdGNhc2UgMTpcblx0XHRcdFx0cmV0dXJuICdTdHJhaWdodCc7XG5cdFx0XHRjYXNlIDI6XG5cdFx0XHRcdHJldHVybiAnU2xpZ2h0UmlnaHQnO1xuXHRcdFx0Y2FzZSAzOlxuXHRcdFx0XHRyZXR1cm4gJ1JpZ2h0Jztcblx0XHRcdGNhc2UgNDpcblx0XHRcdFx0cmV0dXJuICdTaGFycFJpZ2h0Jztcblx0XHRcdGNhc2UgNTpcblx0XHRcdFx0cmV0dXJuICdUdXJuQXJvdW5kJztcblx0XHRcdGNhc2UgNjpcblx0XHRcdFx0cmV0dXJuICdTaGFycExlZnQnO1xuXHRcdFx0Y2FzZSA3OlxuXHRcdFx0XHRyZXR1cm4gJ0xlZnQnO1xuXHRcdFx0Y2FzZSA4OlxuXHRcdFx0XHRyZXR1cm4gJ1NsaWdodExlZnQnO1xuXHRcdFx0Y2FzZSA5OlxuXHRcdFx0XHRyZXR1cm4gJ1dheXBvaW50UmVhY2hlZCc7XG5cdFx0XHRjYXNlIDEwOlxuXHRcdFx0XHQvLyBUT0RPOiBcIkhlYWQgb25cIlxuXHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vRGVubmlzT1NSTS9Qcm9qZWN0LU9TUk0vYmxvYi9tYXN0ZXIvRGF0YVN0cnVjdHVyZXMvVHVybkluc3RydWN0aW9ucy5oI0w0OFxuXHRcdFx0XHRyZXR1cm4gJ1N0cmFpZ2h0Jztcblx0XHRcdGNhc2UgMTE6XG5cdFx0XHRjYXNlIDEyOlxuXHRcdFx0XHRyZXR1cm4gJ1JvdW5kYWJvdXQnO1xuXHRcdFx0Y2FzZSAxNTpcblx0XHRcdFx0cmV0dXJuICdEZXN0aW5hdGlvblJlYWNoZWQnO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdF9jbGFtcEluZGljZXM6IGZ1bmN0aW9uKGluZGljZXMsIGNvb3Jkcykge1xuXHRcdFx0dmFyIG1heENvb3JkSW5kZXggPSBjb29yZHMubGVuZ3RoIC0gMSxcblx0XHRcdFx0aTtcblx0XHRcdGZvciAoaSA9IDA7IGkgPCBpbmRpY2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGluZGljZXNbaV0gPSBNYXRoLm1pbihtYXhDb29yZEluZGV4LCBNYXRoLm1heChpbmRpY2VzW2ldLCAwKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRMLlJvdXRpbmcub3NybSA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcblx0XHRyZXR1cm4gbmV3IEwuUm91dGluZy5PU1JNKG9wdGlvbnMpO1xuXHR9O1xuXG5cdG1vZHVsZS5leHBvcnRzID0gTC5Sb3V0aW5nO1xufSkoKTtcbiIsIihmdW5jdGlvbigpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG5cdHZhciBMID0gcmVxdWlyZSgnbGVhZmxldCcpO1xuXHRMLlJvdXRpbmcgPSBMLlJvdXRpbmcgfHwge307XG5cdEwuZXh0ZW5kKEwuUm91dGluZywgcmVxdWlyZSgnLi9MLlJvdXRpbmcuQXV0b2NvbXBsZXRlJykpO1xuXHRMLmV4dGVuZChMLlJvdXRpbmcsIHJlcXVpcmUoJy4vTC5Sb3V0aW5nLldheXBvaW50JykpO1xuXG5cdGZ1bmN0aW9uIHNlbGVjdElucHV0VGV4dChpbnB1dCkge1xuXHRcdGlmIChpbnB1dC5zZXRTZWxlY3Rpb25SYW5nZSkge1xuXHRcdFx0Ly8gT24gaU9TLCBzZWxlY3QoKSBkb2Vzbid0IHdvcmtcblx0XHRcdGlucHV0LnNldFNlbGVjdGlvblJhbmdlKDAsIDk5OTkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBPbiBhdCBsZWFzdCBJRTgsIHNldFNlbGVlY3Rpb25SYW5nZSBkb2Vzbid0IGV4aXN0XG5cdFx0XHRpbnB1dC5zZWxlY3QoKTtcblx0XHR9XG5cdH1cblxuXHRMLlJvdXRpbmcuUGxhbiA9IEwuQ2xhc3MuZXh0ZW5kKHtcblx0XHRpbmNsdWRlczogTC5NaXhpbi5FdmVudHMsXG5cblx0XHRvcHRpb25zOiB7XG5cdFx0XHRkcmFnU3R5bGVzOiBbXG5cdFx0XHRcdHtjb2xvcjogJ2JsYWNrJywgb3BhY2l0eTogMC4xNSwgd2VpZ2h0OiA5fSxcblx0XHRcdFx0e2NvbG9yOiAnd2hpdGUnLCBvcGFjaXR5OiAwLjgsIHdlaWdodDogNn0sXG5cdFx0XHRcdHtjb2xvcjogJ3JlZCcsIG9wYWNpdHk6IDEsIHdlaWdodDogMiwgZGFzaEFycmF5OiAnNywxMid9XG5cdFx0XHRdLFxuXHRcdFx0ZHJhZ2dhYmxlV2F5cG9pbnRzOiB0cnVlLFxuXHRcdFx0cm91dGVXaGlsZURyYWdnaW5nOiBmYWxzZSxcblx0XHRcdGFkZFdheXBvaW50czogdHJ1ZSxcblx0XHRcdHJldmVyc2VXYXlwb2ludHM6IGZhbHNlLFxuXHRcdFx0YWRkQnV0dG9uQ2xhc3NOYW1lOiAnJyxcblx0XHRcdG1heEdlb2NvZGVyVG9sZXJhbmNlOiAyMDAsXG5cdFx0XHRhdXRvY29tcGxldGVPcHRpb25zOiB7fSxcblx0XHRcdGdlb2NvZGVyc0NsYXNzTmFtZTogJycsXG5cdFx0XHRnZW9jb2RlclBsYWNlaG9sZGVyOiBmdW5jdGlvbihpLCBudW1iZXJXYXlwb2ludHMpIHtcblx0XHRcdFx0cmV0dXJuIGkgPT09IDAgP1xuXHRcdFx0XHRcdCdTdGFydCcgOlxuXHRcdFx0XHRcdChpIDwgbnVtYmVyV2F5cG9pbnRzIC0gMSA/XG5cdFx0XHRcdFx0XHRcdFx0XHQnVmlhICcgKyBpIDpcblx0XHRcdFx0XHRcdFx0XHRcdCdFbmQnKTtcblx0XHRcdH0sXG5cdFx0XHRnZW9jb2RlckNsYXNzOiBmdW5jdGlvbigpIHtcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUdlb2NvZGVyOiBmdW5jdGlvbigpIHtcblx0XHRcdFx0dmFyIGNvbnRhaW5lciA9IEwuRG9tVXRpbC5jcmVhdGUoJ2RpdicsICdsZWFmbGV0LXJvdXRpbmctZ2VvY29kZXInKSxcblx0XHRcdFx0XHRpbnB1dCA9IEwuRG9tVXRpbC5jcmVhdGUoJ2lucHV0JywgJycsIGNvbnRhaW5lciksXG5cdFx0XHRcdFx0cmVtb3ZlID0gTC5Eb21VdGlsLmNyZWF0ZSgnc3BhbicsICdsZWFmbGV0LXJvdXRpbmctcmVtb3ZlLXdheXBvaW50JywgY29udGFpbmVyKTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbnRhaW5lcjogY29udGFpbmVyLFxuXHRcdFx0XHRcdGlucHV0OiBpbnB1dCxcblx0XHRcdFx0XHRjbG9zZUJ1dHRvbjogcmVtb3ZlXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlTWFya2VyOiBmdW5jdGlvbihpLCB3cCkge1xuXHRcdFx0XHR2YXIgb3B0aW9ucyA9IHtcblx0XHRcdFx0XHRcdGRyYWdnYWJsZTogdGhpcy5kcmFnZ2FibGVXYXlwb2ludHNcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHQgICAgbWFya2VyID0gTC5tYXJrZXIod3AubGF0TG5nLCBvcHRpb25zKTtcblxuXHRcdFx0XHRyZXR1cm4gbWFya2VyO1xuXHRcdFx0fSxcblx0XHRcdHdheXBvaW50TmFtZUZhbGxiYWNrOiBmdW5jdGlvbihsYXRMbmcpIHtcblx0XHRcdFx0dmFyIG5zID0gbGF0TG5nLmxhdCA8IDAgPyAnUycgOiAnTicsXG5cdFx0XHRcdCAgICBldyA9IGxhdExuZy5sbmcgPCAwID8gJ1cnIDogJ0UnLFxuXHRcdFx0XHQgICAgbGF0ID0gKE1hdGgucm91bmQoTWF0aC5hYnMobGF0TG5nLmxhdCkgKiAxMDAwMCkgLyAxMDAwMCkudG9TdHJpbmcoKSxcblx0XHRcdFx0ICAgIGxuZyA9IChNYXRoLnJvdW5kKE1hdGguYWJzKGxhdExuZy5sbmcpICogMTAwMDApIC8gMTAwMDApLnRvU3RyaW5nKCk7XG5cdFx0XHRcdHJldHVybiBucyArIGxhdCArICcsICcgKyBldyArIGxuZztcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24od2F5cG9pbnRzLCBvcHRpb25zKSB7XG5cdFx0XHRMLlV0aWwuc2V0T3B0aW9ucyh0aGlzLCBvcHRpb25zKTtcblx0XHRcdHRoaXMuX3dheXBvaW50cyA9IFtdO1xuXHRcdFx0dGhpcy5zZXRXYXlwb2ludHMod2F5cG9pbnRzKTtcblx0XHR9LFxuXG5cdFx0aXNSZWFkeTogZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgaTtcblx0XHRcdGZvciAoaSA9IDA7IGkgPCB0aGlzLl93YXlwb2ludHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKCF0aGlzLl93YXlwb2ludHNbaV0ubGF0TG5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0sXG5cblx0XHRnZXRXYXlwb2ludHM6IGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIGksXG5cdFx0XHRcdHdwcyA9IFtdO1xuXG5cdFx0XHRmb3IgKGkgPSAwOyBpIDwgdGhpcy5fd2F5cG9pbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHdwcy5wdXNoKHRoaXMuX3dheXBvaW50c1tpXSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB3cHM7XG5cdFx0fSxcblxuXHRcdHNldFdheXBvaW50czogZnVuY3Rpb24od2F5cG9pbnRzKSB7XG5cdFx0XHR2YXIgYXJncyA9IFswLCB0aGlzLl93YXlwb2ludHMubGVuZ3RoXS5jb25jYXQod2F5cG9pbnRzKTtcblx0XHRcdHRoaXMuc3BsaWNlV2F5cG9pbnRzLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fSxcblxuXHRcdHNwbGljZVdheXBvaW50czogZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgYXJncyA9IFthcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXV0sXG5cdFx0XHQgICAgaTtcblxuXHRcdFx0Zm9yIChpID0gMjsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRhcmdzLnB1c2goYXJndW1lbnRzW2ldICYmIGFyZ3VtZW50c1tpXS5oYXNPd25Qcm9wZXJ0eSgnbGF0TG5nJykgPyBhcmd1bWVudHNbaV0gOiBMLlJvdXRpbmcud2F5cG9pbnQoYXJndW1lbnRzW2ldKSk7XG5cdFx0XHR9XG5cblx0XHRcdFtdLnNwbGljZS5hcHBseSh0aGlzLl93YXlwb2ludHMsIGFyZ3MpO1xuXG5cdFx0XHR0aGlzLl91cGRhdGVNYXJrZXJzKCk7XG5cdFx0XHR0aGlzLl9maXJlQ2hhbmdlZC5hcHBseSh0aGlzLCBhcmdzKTtcblxuXHRcdFx0Ly8gTWFrZSBzdXJlIHRoZXJlJ3MgYWx3YXlzIGF0IGxlYXN0IHR3byB3YXlwb2ludHNcblx0XHRcdHdoaWxlICh0aGlzLl93YXlwb2ludHMubGVuZ3RoIDwgMikge1xuXHRcdFx0XHR0aGlzLnNwbGljZVdheXBvaW50cyh0aGlzLl93YXlwb2ludHMubGVuZ3RoLCAwLCBudWxsKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0b25BZGQ6IGZ1bmN0aW9uKG1hcCkge1xuXHRcdFx0dGhpcy5fbWFwID0gbWFwO1xuXHRcdFx0dGhpcy5fdXBkYXRlTWFya2VycygpO1xuXHRcdH0sXG5cblx0XHRvblJlbW92ZTogZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgaTtcblx0XHRcdHRoaXMuX3JlbW92ZU1hcmtlcnMoKTtcblxuXHRcdFx0aWYgKHRoaXMuX25ld1dwKSB7XG5cdFx0XHRcdGZvciAoaSA9IDA7IGkgPCB0aGlzLl9uZXdXcC5saW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdHRoaXMuX21hcC5yZW1vdmVMYXllcih0aGlzLl9uZXdXcC5saW5lc1tpXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZGVsZXRlIHRoaXMuX21hcDtcblx0XHR9LFxuXG5cdFx0Y3JlYXRlR2VvY29kZXJzOiBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBjb250YWluZXIgPSBMLkRvbVV0aWwuY3JlYXRlKCdkaXYnLCAnbGVhZmxldC1yb3V0aW5nLWdlb2NvZGVycyAnICsgdGhpcy5vcHRpb25zLmdlb2NvZGVyc0NsYXNzTmFtZSksXG5cdFx0XHRcdHdheXBvaW50cyA9IHRoaXMuX3dheXBvaW50cyxcblx0XHRcdCAgICBhZGRXcEJ0bixcblx0XHRcdCAgICByZXZlcnNlQnRuO1xuXG5cdFx0XHR0aGlzLl9nZW9jb2RlckNvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHRcdHRoaXMuX2dlb2NvZGVyRWxlbXMgPSBbXTtcblxuXG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLmFkZFdheXBvaW50cykge1xuXHRcdFx0XHRhZGRXcEJ0biA9IEwuRG9tVXRpbC5jcmVhdGUoJ2J1dHRvbicsICdsZWFmbGV0LXJvdXRpbmctYWRkLXdheXBvaW50ICcgKyB0aGlzLm9wdGlvbnMuYWRkQnV0dG9uQ2xhc3NOYW1lLCBjb250YWluZXIpO1xuXHRcdFx0XHRhZGRXcEJ0bi5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRcdEwuRG9tRXZlbnQuYWRkTGlzdGVuZXIoYWRkV3BCdG4sICdjbGljaycsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdHRoaXMuc3BsaWNlV2F5cG9pbnRzKHdheXBvaW50cy5sZW5ndGgsIDAsIG51bGwpO1xuXHRcdFx0XHR9LCB0aGlzKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5yZXZlcnNlV2F5cG9pbnRzKSB7XG5cdFx0XHRcdHJldmVyc2VCdG4gPSBMLkRvbVV0aWwuY3JlYXRlKCdidXR0b24nLCAnbGVhZmxldC1yb3V0aW5nLXJldmVyc2Utd2F5cG9pbnRzJywgY29udGFpbmVyKTtcblx0XHRcdFx0cmV2ZXJzZUJ0bi5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRcdEwuRG9tRXZlbnQuYWRkTGlzdGVuZXIocmV2ZXJzZUJ0biwgJ2NsaWNrJywgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0dGhpcy5fd2F5cG9pbnRzLnJldmVyc2UoKTtcblx0XHRcdFx0XHR0aGlzLnNldFdheXBvaW50cyh0aGlzLl93YXlwb2ludHMpO1xuXHRcdFx0XHR9LCB0aGlzKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fdXBkYXRlR2VvY29kZXJzKCk7XG5cdFx0XHR0aGlzLm9uKCd3YXlwb2ludHNzcGxpY2VkJywgdGhpcy5fdXBkYXRlR2VvY29kZXJzKTtcblxuXHRcdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0XHR9LFxuXG5cdFx0X2NyZWF0ZUdlb2NvZGVyOiBmdW5jdGlvbihpKSB7XG5cdFx0XHR2YXIgbldwcyA9IHRoaXMuX3dheXBvaW50cy5sZW5ndGgsXG5cdFx0XHRcdGcgPSB0aGlzLm9wdGlvbnMuY3JlYXRlR2VvY29kZXIoaSwgbldwcyksXG5cdFx0XHRcdGNsb3NlQnV0dG9uID0gZy5jbG9zZUJ1dHRvbixcblx0XHRcdFx0Z2VvY29kZXJJbnB1dCA9IGcuaW5wdXQsXG5cdFx0XHRcdHdwID0gdGhpcy5fd2F5cG9pbnRzW2ldO1xuXHRcdFx0Z2VvY29kZXJJbnB1dC5zZXRBdHRyaWJ1dGUoJ3BsYWNlaG9sZGVyJywgdGhpcy5vcHRpb25zLmdlb2NvZGVyUGxhY2Vob2xkZXIoaSwgbldwcykpO1xuXHRcdFx0Z2VvY29kZXJJbnB1dC5jbGFzc05hbWUgPSB0aGlzLm9wdGlvbnMuZ2VvY29kZXJDbGFzcyhpLCBuV3BzKTtcblxuXHRcdFx0dGhpcy5fdXBkYXRlV2F5cG9pbnROYW1lKGksIGdlb2NvZGVySW5wdXQpO1xuXHRcdFx0Ly8gVGhpcyBoYXMgdG8gYmUgaGVyZSwgb3IgZ2VvY29kZXIncyB2YWx1ZSB3aWxsIG5vdCBiZSBwcm9wZXJseVxuXHRcdFx0Ly8gaW5pdGlhbGl6ZWQuXG5cdFx0XHQvLyBUT0RPOiBsb29rIGludG8gd2h5IGFuZCBtYWtlIF91cGRhdGVXYXlwb2ludE5hbWUgZml4IHRoaXMuXG5cdFx0XHRnZW9jb2RlcklucHV0LnZhbHVlID0gd3AubmFtZTtcblxuXHRcdFx0TC5Eb21FdmVudC5hZGRMaXN0ZW5lcihnZW9jb2RlcklucHV0LCAnY2xpY2snLCBmdW5jdGlvbigpIHtcblx0XHRcdFx0c2VsZWN0SW5wdXRUZXh0KHRoaXMpO1xuXHRcdFx0fSwgZ2VvY29kZXJJbnB1dCk7XG5cblx0XHRcdGlmIChjbG9zZUJ1dHRvbikge1xuXHRcdFx0XHRMLkRvbUV2ZW50LmFkZExpc3RlbmVyKGNsb3NlQnV0dG9uLCAnY2xpY2snLCBmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRpZiAoaSA+IDAgfHwgdGhpcy5fd2F5cG9pbnRzLmxlbmd0aCA+IDIpIHtcblx0XHRcdFx0XHRcdHRoaXMuc3BsaWNlV2F5cG9pbnRzKGksIDEpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNwbGljZVdheXBvaW50cyhpLCAxLCBuZXcgTC5Sb3V0aW5nLldheXBvaW50KCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgdGhpcyk7XG5cdFx0XHR9XG5cblx0XHRcdG5ldyBMLlJvdXRpbmcuQXV0b2NvbXBsZXRlKGdlb2NvZGVySW5wdXQsIGZ1bmN0aW9uKHIpIHtcblx0XHRcdFx0XHRnZW9jb2RlcklucHV0LnZhbHVlID0gci5uYW1lO1xuXHRcdFx0XHRcdHdwLm5hbWUgPSByLm5hbWU7XG5cdFx0XHRcdFx0d3AubGF0TG5nID0gci5jZW50ZXI7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlTWFya2VycygpO1xuXHRcdFx0XHRcdHRoaXMuX2ZpcmVDaGFuZ2VkKCk7XG5cdFx0XHRcdFx0dGhpcy5fZm9jdXNHZW9jb2RlcihpICsgMSk7XG5cdFx0XHRcdH0sIHRoaXMsIEwuZXh0ZW5kKHtcblx0XHRcdFx0XHRyZXN1bHRGbjogdGhpcy5vcHRpb25zLmdlb2NvZGVyLmdlb2NvZGUsXG5cdFx0XHRcdFx0cmVzdWx0Q29udGV4dDogdGhpcy5vcHRpb25zLmdlb2NvZGVyLFxuXHRcdFx0XHRcdGF1dG9jb21wbGV0ZUZuOiB0aGlzLm9wdGlvbnMuZ2VvY29kZXIuc3VnZ2VzdCxcblx0XHRcdFx0XHRhdXRvY29tcGxldGVDb250ZXh0OiB0aGlzLm9wdGlvbnMuZ2VvY29kZXJcblx0XHRcdFx0fSwgdGhpcy5vcHRpb25zLmF1dG9jb21wbGV0ZU9wdGlvbnMpKTtcblxuXHRcdFx0cmV0dXJuIGc7XG5cdFx0fSxcblxuXHRcdF91cGRhdGVHZW9jb2RlcnM6IGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIGVsZW1zID0gW10sXG5cdFx0XHRcdGksXG5cdFx0XHQgICAgZ2VvY29kZXJFbGVtO1xuXG5cdFx0XHRmb3IgKGkgPSAwOyBpIDwgdGhpcy5fZ2VvY29kZXJFbGVtcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHR0aGlzLl9nZW9jb2RlckNvbnRhaW5lci5yZW1vdmVDaGlsZCh0aGlzLl9nZW9jb2RlckVsZW1zW2ldLmNvbnRhaW5lcik7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoaSA9IHRoaXMuX3dheXBvaW50cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRnZW9jb2RlckVsZW0gPSB0aGlzLl9jcmVhdGVHZW9jb2RlcihpKTtcblx0XHRcdFx0dGhpcy5fZ2VvY29kZXJDb250YWluZXIuaW5zZXJ0QmVmb3JlKGdlb2NvZGVyRWxlbS5jb250YWluZXIsIHRoaXMuX2dlb2NvZGVyQ29udGFpbmVyLmZpcnN0Q2hpbGQpO1xuXHRcdFx0XHRlbGVtcy5wdXNoKGdlb2NvZGVyRWxlbSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2dlb2NvZGVyRWxlbXMgPSBlbGVtcy5yZXZlcnNlKCk7XG5cdFx0fSxcblxuXHRcdF91cGRhdGVHZW9jb2RlcjogZnVuY3Rpb24oaSwgZ2VvY29kZXJFbGVtKSB7XG5cdFx0XHR2YXIgd3AgPSB0aGlzLl93YXlwb2ludHNbaV0sXG5cdFx0XHQgICAgdmFsdWUgPSB3cCAmJiB3cC5uYW1lID8gd3AubmFtZSA6ICcnO1xuXHRcdFx0aWYgKGdlb2NvZGVyRWxlbSkge1xuXHRcdFx0XHRnZW9jb2RlckVsZW0udmFsdWUgPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0X3VwZGF0ZVdheXBvaW50TmFtZTogZnVuY3Rpb24oaSwgZ2VvY29kZXJFbGVtLCBmb3JjZSkge1xuXHRcdFx0dmFyIHdwID0gdGhpcy5fd2F5cG9pbnRzW2ldLFxuXHRcdFx0XHRcdHdwQ29vcmRzO1xuXG5cdFx0XHR3cC5uYW1lID0gd3AubmFtZSB8fCAnJztcblxuXHRcdFx0aWYgKHdwLmxhdExuZyAmJiAoZm9yY2UgfHwgIXdwLm5hbWUpKSB7XG5cdFx0XHRcdHdwQ29vcmRzID0gdGhpcy5vcHRpb25zLndheXBvaW50TmFtZUZhbGxiYWNrKHdwLmxhdExuZyk7XG5cdFx0XHRcdGlmICh0aGlzLm9wdGlvbnMuZ2VvY29kZXIgJiYgdGhpcy5vcHRpb25zLmdlb2NvZGVyLnJldmVyc2UpIHtcblx0XHRcdFx0XHR0aGlzLm9wdGlvbnMuZ2VvY29kZXIucmV2ZXJzZSh3cC5sYXRMbmcsIDY3MTA4ODY0IC8qIHpvb20gMTggKi8sIGZ1bmN0aW9uKHJzKSB7XG5cdFx0XHRcdFx0XHRpZiAocnMubGVuZ3RoID4gMCAmJiByc1swXS5jZW50ZXIuZGlzdGFuY2VUbyh3cC5sYXRMbmcpIDwgdGhpcy5vcHRpb25zLm1heEdlb2NvZGVyVG9sZXJhbmNlKSB7XG5cdFx0XHRcdFx0XHRcdHdwLm5hbWUgPSByc1swXS5uYW1lO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0d3AubmFtZSA9IHdwQ29vcmRzO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dGhpcy5fdXBkYXRlR2VvY29kZXIoaSwgZ2VvY29kZXJFbGVtKTtcblx0XHRcdFx0XHR9LCB0aGlzKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR3cC5uYW1lID0gd3BDb29yZHM7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl91cGRhdGVHZW9jb2RlcihpLCBnZW9jb2RlckVsZW0pO1xuXHRcdFx0fVxuXG5cdFx0fSxcblxuXHRcdF9yZW1vdmVNYXJrZXJzOiBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBpO1xuXHRcdFx0aWYgKHRoaXMuX21hcmtlcnMpIHtcblx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IHRoaXMuX21hcmtlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRpZiAodGhpcy5fbWFya2Vyc1tpXSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbWFwLnJlbW92ZUxheWVyKHRoaXMuX21hcmtlcnNbaV0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbWFya2VycyA9IFtdO1xuXHRcdH0sXG5cblx0XHRfdXBkYXRlTWFya2VyczogZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgaSxcblx0XHRcdCAgICBtO1xuXG5cdFx0XHRpZiAoIXRoaXMuX21hcCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3JlbW92ZU1hcmtlcnMoKTtcblxuXHRcdFx0Zm9yIChpID0gMDsgaSA8IHRoaXMuX3dheXBvaW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAodGhpcy5fd2F5cG9pbnRzW2ldLmxhdExuZykge1xuXHRcdFx0XHRcdG0gPSB0aGlzLm9wdGlvbnMuY3JlYXRlTWFya2VyKGksIHRoaXMuX3dheXBvaW50c1tpXSwgdGhpcy5fd2F5cG9pbnRzLmxlbmd0aCk7XG5cdFx0XHRcdFx0aWYgKG0pIHtcblx0XHRcdFx0XHRcdG0uYWRkVG8odGhpcy5fbWFwKTtcblx0XHRcdFx0XHRcdGlmICh0aGlzLm9wdGlvbnMuZHJhZ2dhYmxlV2F5cG9pbnRzKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2hvb2tXYXlwb2ludEV2ZW50cyhtLCBpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bSA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbWFya2Vycy5wdXNoKG0pO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfZmlyZUNoYW5nZWQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0dGhpcy5maXJlKCd3YXlwb2ludHNjaGFuZ2VkJywge3dheXBvaW50czogdGhpcy5nZXRXYXlwb2ludHMoKX0pO1xuXG5cdFx0XHRpZiAoYXJndW1lbnRzLmxlbmd0aCA+PSAyKSB7XG5cdFx0XHRcdHRoaXMuZmlyZSgnd2F5cG9pbnRzc3BsaWNlZCcsIHtcblx0XHRcdFx0XHRpbmRleDogQXJyYXkucHJvdG90eXBlLnNoaWZ0LmNhbGwoYXJndW1lbnRzKSxcblx0XHRcdFx0XHRuUmVtb3ZlZDogQXJyYXkucHJvdG90eXBlLnNoaWZ0LmNhbGwoYXJndW1lbnRzKSxcblx0XHRcdFx0XHRhZGRlZDogYXJndW1lbnRzXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfaG9va1dheXBvaW50RXZlbnRzOiBmdW5jdGlvbihtLCBpLCB0cmFja01vdXNlTW92ZSkge1xuXHRcdFx0dmFyIGV2ZW50TGF0TG5nID0gZnVuY3Rpb24oZSkge1xuXHRcdFx0XHRcdHJldHVybiB0cmFja01vdXNlTW92ZSA/IGUubGF0bG5nIDogZS50YXJnZXQuZ2V0TGF0TG5nKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRyYWdTdGFydCA9IEwuYmluZChmdW5jdGlvbihlKSB7XG5cdFx0XHRcdFx0dGhpcy5maXJlKCd3YXlwb2ludGRyYWdzdGFydCcsIHtpbmRleDogaSwgbGF0bG5nOiBldmVudExhdExuZyhlKX0pO1xuXHRcdFx0XHR9LCB0aGlzKSxcblx0XHRcdFx0ZHJhZyA9IEwuYmluZChmdW5jdGlvbihlKSB7XG5cdFx0XHRcdFx0dGhpcy5fd2F5cG9pbnRzW2ldLmxhdExuZyA9IGV2ZW50TGF0TG5nKGUpO1xuXHRcdFx0XHRcdHRoaXMuZmlyZSgnd2F5cG9pbnRkcmFnJywge2luZGV4OiBpLCBsYXRsbmc6IGV2ZW50TGF0TG5nKGUpfSk7XG5cdFx0XHRcdH0sIHRoaXMpLFxuXHRcdFx0XHRkcmFnRW5kID0gTC5iaW5kKGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0XHR0aGlzLl93YXlwb2ludHNbaV0ubGF0TG5nID0gZXZlbnRMYXRMbmcoZSk7XG5cdFx0XHRcdFx0dGhpcy5fd2F5cG9pbnRzW2ldLm5hbWUgPSAnJztcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVXYXlwb2ludE5hbWUoaSwgdGhpcy5fZ2VvY29kZXJFbGVtcyAmJiB0aGlzLl9nZW9jb2RlckVsZW1zW2ldLmlucHV0LCB0cnVlKTtcblx0XHRcdFx0XHR0aGlzLmZpcmUoJ3dheXBvaW50ZHJhZ2VuZCcsIHtpbmRleDogaSwgbGF0bG5nOiBldmVudExhdExuZyhlKX0pO1xuXHRcdFx0XHRcdHRoaXMuX2ZpcmVDaGFuZ2VkKCk7XG5cdFx0XHRcdH0sIHRoaXMpLFxuXHRcdFx0XHRtb3VzZU1vdmUsXG5cdFx0XHRcdG1vdXNlVXA7XG5cblx0XHRcdGlmICh0cmFja01vdXNlTW92ZSkge1xuXHRcdFx0XHRtb3VzZU1vdmUgPSBMLmJpbmQoZnVuY3Rpb24oZSkge1xuXHRcdFx0XHRcdHRoaXMuX21hcmtlcnNbaV0uc2V0TGF0TG5nKGUubGF0bG5nKTtcblx0XHRcdFx0XHRkcmFnKGUpO1xuXHRcdFx0XHR9LCB0aGlzKTtcblx0XHRcdFx0bW91c2VVcCA9IEwuYmluZChmdW5jdGlvbihlKSB7XG5cdFx0XHRcdFx0dGhpcy5fbWFwLmRyYWdnaW5nLmVuYWJsZSgpO1xuXHRcdFx0XHRcdHRoaXMuX21hcC5vZmYoJ21vdXNldXAnLCBtb3VzZVVwKTtcblx0XHRcdFx0XHR0aGlzLl9tYXAub2ZmKCdtb3VzZW1vdmUnLCBtb3VzZU1vdmUpO1xuXHRcdFx0XHRcdGRyYWdFbmQoZSk7XG5cdFx0XHRcdH0sIHRoaXMpO1xuXHRcdFx0XHR0aGlzLl9tYXAuZHJhZ2dpbmcuZGlzYWJsZSgpO1xuXHRcdFx0XHR0aGlzLl9tYXAub24oJ21vdXNlbW92ZScsIG1vdXNlTW92ZSk7XG5cdFx0XHRcdHRoaXMuX21hcC5vbignbW91c2V1cCcsIG1vdXNlVXApO1xuXHRcdFx0XHRkcmFnU3RhcnQoe2xhdGxuZzogdGhpcy5fd2F5cG9pbnRzW2ldLmxhdExuZ30pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bS5vbignZHJhZ3N0YXJ0JywgZHJhZ1N0YXJ0KTtcblx0XHRcdFx0bS5vbignZHJhZycsIGRyYWcpO1xuXHRcdFx0XHRtLm9uKCdkcmFnZW5kJywgZHJhZ0VuZCk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdGRyYWdOZXdXYXlwb2ludDogZnVuY3Rpb24oZSkge1xuXHRcdFx0dmFyIG5ld1dwSW5kZXggPSBlLmFmdGVySW5kZXggKyAxO1xuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5yb3V0ZVdoaWxlRHJhZ2dpbmcpIHtcblx0XHRcdFx0dGhpcy5zcGxpY2VXYXlwb2ludHMobmV3V3BJbmRleCwgMCwgZS5sYXRsbmcpO1xuXHRcdFx0XHR0aGlzLl9ob29rV2F5cG9pbnRFdmVudHModGhpcy5fbWFya2Vyc1tuZXdXcEluZGV4XSwgbmV3V3BJbmRleCwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9kcmFnTmV3V2F5cG9pbnQobmV3V3BJbmRleCwgZS5sYXRsbmcpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHRfZHJhZ05ld1dheXBvaW50OiBmdW5jdGlvbihuZXdXcEluZGV4LCBpbml0aWFsTGF0TG5nKSB7XG5cdFx0XHR2YXIgd3AgPSBuZXcgTC5Sb3V0aW5nLldheXBvaW50KGluaXRpYWxMYXRMbmcpLFxuXHRcdFx0XHRwcmV2V3AgPSB0aGlzLl93YXlwb2ludHNbbmV3V3BJbmRleCAtIDFdLFxuXHRcdFx0XHRuZXh0V3AgPSB0aGlzLl93YXlwb2ludHNbbmV3V3BJbmRleF0sXG5cdFx0XHRcdG1hcmtlciA9IHRoaXMub3B0aW9ucy5jcmVhdGVNYXJrZXIobmV3V3BJbmRleCwgd3AsIHRoaXMuX3dheXBvaW50cy5sZW5ndGggKyAxKSxcblx0XHRcdFx0bGluZXMgPSBbXSxcblx0XHRcdFx0bW91c2VNb3ZlID0gTC5iaW5kKGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0XHR2YXIgaTtcblx0XHRcdFx0XHRpZiAobWFya2VyKSB7XG5cdFx0XHRcdFx0XHRtYXJrZXIuc2V0TGF0TG5nKGUubGF0bG5nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRsaW5lc1tpXS5zcGxpY2VMYXRMbmdzKDEsIDEsIGUubGF0bG5nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHRoaXMpLFxuXHRcdFx0XHRtb3VzZVVwID0gTC5iaW5kKGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0XHR2YXIgaTtcblx0XHRcdFx0XHRpZiAobWFya2VyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9tYXAucmVtb3ZlTGF5ZXIobWFya2VyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9tYXAucmVtb3ZlTGF5ZXIobGluZXNbaV0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9tYXAub2ZmKCdtb3VzZW1vdmUnLCBtb3VzZU1vdmUpO1xuXHRcdFx0XHRcdHRoaXMuX21hcC5vZmYoJ21vdXNldXAnLCBtb3VzZVVwKTtcblx0XHRcdFx0XHR0aGlzLnNwbGljZVdheXBvaW50cyhuZXdXcEluZGV4LCAwLCBlLmxhdGxuZyk7XG5cdFx0XHRcdH0sIHRoaXMpLFxuXHRcdFx0XHRpO1xuXG5cdFx0XHRpZiAobWFya2VyKSB7XG5cdFx0XHRcdG1hcmtlci5hZGRUbyh0aGlzLl9tYXApO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGkgPSAwOyBpIDwgdGhpcy5vcHRpb25zLmRyYWdTdHlsZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0bGluZXMucHVzaChMLnBvbHlsaW5lKFtwcmV2V3AubGF0TG5nLCBpbml0aWFsTGF0TG5nLCBuZXh0V3AubGF0TG5nXSxcblx0XHRcdFx0XHR0aGlzLm9wdGlvbnMuZHJhZ1N0eWxlc1tpXSkuYWRkVG8odGhpcy5fbWFwKSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX21hcC5vbignbW91c2Vtb3ZlJywgbW91c2VNb3ZlKTtcblx0XHRcdHRoaXMuX21hcC5vbignbW91c2V1cCcsIG1vdXNlVXApO1xuXHRcdH0sXG5cblx0XHRfZm9jdXNHZW9jb2RlcjogZnVuY3Rpb24oaSkge1xuXHRcdFx0dmFyIGlucHV0O1xuXHRcdFx0aWYgKHRoaXMuX2dlb2NvZGVyRWxlbXNbaV0pIHtcblx0XHRcdFx0aW5wdXQgPSB0aGlzLl9nZW9jb2RlckVsZW1zW2ldLmlucHV0O1xuXHRcdFx0XHRpbnB1dC5mb2N1cygpO1xuXHRcdFx0XHRzZWxlY3RJbnB1dFRleHQoaW5wdXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZG9jdW1lbnQuYWN0aXZlRWxlbWVudC5ibHVyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRMLlJvdXRpbmcucGxhbiA9IGZ1bmN0aW9uKHdheXBvaW50cywgb3B0aW9ucykge1xuXHRcdHJldHVybiBuZXcgTC5Sb3V0aW5nLlBsYW4od2F5cG9pbnRzLCBvcHRpb25zKTtcblx0fTtcblxuXHRtb2R1bGUuZXhwb3J0cyA9IEwuUm91dGluZztcbn0pKCk7XG4iLCIoZnVuY3Rpb24oKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuXHR2YXIgTCA9IHJlcXVpcmUoJ2xlYWZsZXQnKTtcblx0TC5Sb3V0aW5nID0gTC5Sb3V0aW5nIHx8IHt9O1xuXG5cdEwuUm91dGluZy5XYXlwb2ludCA9IEwuQ2xhc3MuZXh0ZW5kKHtcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0YWxsb3dVVHVybjogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0aW5pdGlhbGl6ZTogZnVuY3Rpb24obGF0TG5nLCBuYW1lLCBvcHRpb25zKSB7XG5cdFx0XHRcdEwuVXRpbC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xuXHRcdFx0XHR0aGlzLmxhdExuZyA9IGxhdExuZztcblx0XHRcdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRMLlJvdXRpbmcud2F5cG9pbnQgPSBmdW5jdGlvbihsYXRMbmcsIG5hbWUsIG9wdGlvbnMpIHtcblx0XHRyZXR1cm4gbmV3IEwuUm91dGluZy5XYXlwb2ludChsYXRMbmcsIG5hbWUsIG9wdGlvbnMpO1xuXHR9O1xuXG5cdG1vZHVsZS5leHBvcnRzID0gTC5Sb3V0aW5nO1xufSkoKTtcbiIsIid1c2Ugc3RyaWN0Jztcbi8qIGdsb2JhbCBMICovXG5cbnZhciBMUk0gPSByZXF1aXJlKCdsZWFmbGV0LXJvdXRpbmctbWFjaGluZScpO1xudmFyIGxpbmtzID0gcmVxdWlyZSgnLi9zcmMvbGlua3MnKTtcbnZhciBtYXBWaWV3ID0gcmVxdWlyZSgnLi9zcmMvbGVhZmxldF9vcHRpb25zJyk7XG5cbnZhciBwYXJzZWRPcHRpb25zID0gbGlua3MucGFyc2Uod2luZG93LmxvY2F0aW9uLmhhc2gpO1xudmFyIHZpZXdPcHRpb25zID0gTC5leHRlbmQobWFwVmlldy5kZWZhdWx0VmlldywgcGFyc2VkT3B0aW9ucyk7XG5cbnZhciBtYXAgPSBMLm1hcCgnbWFwJywge1xuICAgIHpvb21Db250cm9sOiBmYWxzZSxcbiAgICBkcmFnZ2luZzogZmFsc2UsXG4gICAgc2Nyb2xsV2hlZWxab29tOiBmYWxzZSxcbiAgICB0b3VjaFpvb206IGZhbHNlLFxuICAgIGRvdWJsZUNsaWNrWm9vbTogZmFsc2VcbiAgfVxuICApLnNldFZpZXcocGFyc2VkT3B0aW9ucy5jZW50ZXIsIHZpZXdPcHRpb25zLnpvb20pO1xuXG5MLnRpbGVMYXllcignaHR0cHM6Ly97c30udGlsZXMubWFwYm94LmNvbS92NC8nK21hcFZpZXcuZGVmYXVsdFZpZXcubGF5ZXIrJy97en0ve3h9L3t5fUAyeC5wbmc/YWNjZXNzX3Rva2VuPXBrLmV5SjFJam9pYlhOc1pXVWlMQ0poSWpvaWNscGlUV1Y1U1NKOS5QX2g4cjM3dkQ4anBJSDFBNmkxVlJnJywge1xuXHRhdHRyaWJ1dGlvbjogJ01hcHMgYnkgPGEgaHJlZj1cImh0dHBzOi8vd3d3Lm1hcGJveC5jb20vYWJvdXQvbWFwcy9cIj5NYXBib3g8L2E+LiAnICtcblx0XHQnUm91dGVzIGZyb20gPGEgaHJlZj1cImh0dHA6Ly9wcm9qZWN0LW9zcm0ub3JnL1wiPk9TUk08L2E+LCAnICtcblx0XHQnZGF0YSB1c2VzIDxhIGhyZWY9XCJodHRwOi8vb3BlbmRhdGFjb21tb25zLm9yZy9saWNlbnNlcy9vZGJsL1wiPk9EYkw8L2E+IGxpY2Vuc2UnXG59KS5hZGRUbyhtYXApO1xuXG52YXIgb3NybSA9IEwuUm91dGluZy5vc3JtKCk7XG52YXIgaXRpbmVyYXJ5ID0gTC5Sb3V0aW5nLml0aW5lcmFyeSh7bGFuZ3VhZ2U6IHZpZXdPcHRpb25zLmxhbmd1YWdlfSk7XG52YXIgaXRpbmVyYXJ5Q29udGFpbmVyID0gaXRpbmVyYXJ5Lm9uQWRkKG1hcCk7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaW5zdHJ1Y3Rpb25zXCIpLmFwcGVuZENoaWxkKGl0aW5lcmFyeUNvbnRhaW5lcik7XG5cbm9zcm0ucm91dGUodmlld09wdGlvbnMud2F5cG9pbnRzLCBmdW5jdGlvbihlcnJvciwgYWx0cykge1xuICB2YXIgbGluZSA9IEwuUm91dGluZy5saW5lKGFsdHNbYWx0cy5sZW5ndGggLSAxXSwge30pO1xuXG4gIGxpbmUuYWRkVG8obWFwKTtcbiAgbWFwLmZpdEJvdW5kcyhsaW5lLmdldEJvdW5kcygpKTtcblxuICB2aWV3T3B0aW9ucy53YXlwb2ludHMubWFwKGZ1bmN0aW9uICh3cCkge1xuICAgIEwubWFya2VyKHdwLmxhdExuZykuYWRkVG8obWFwKTtcbiAgfSk7XG5cbiAgaXRpbmVyYXJ5LnNldEFsdGVybmF0aXZlcyhhbHRzKTtcbn0sIG51bGwsIHt9KTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGRlZmF1bHRWaWV3OiB7XG4gICAgY2VudGVyTGF0OiAzOC44OTk1LFxuICAgIGNlbnRlckxuZzogLTc3LjAyNjksXG4gICAgY2VudGVyOiBMLmxhdExuZygzOC44OTk1LC03Ny4wMjY5KSxcbiAgICB6b29tOiAxMyxcbiAgICB3YXlwb2ludHM6IFtdLFxuICAgIGxhbmd1YWdlOiAnZW4nLFxuICAgIGFsdGVybmF0aXZlOiB0cnVlLFxuXHQvLyBiZXN0IHdheSB0byBwYXNzPz9cbiAgICBsYXllcjogJ21hcGJveC5lbWVyYWxkJ1xuICB9LFxuXG4gIHNlcnZpY2VzOiBbXG4gICAge1xuICAgICAgbGFiZWw6ICdDYXIgKGZhc3Rlc3QpJyxcbiAgICAgIHBhdGg6ICcvL3JvdXRlci5wcm9qZWN0LW9zcm0ub3JnL3ZpYXJvdXRlJ1xuICAgIH1cbiAgXSxcblxuICBsYXllcjogW1xuICAgIHtcbiAgICAgIGxhYmVsOiAnTWFwYm94IEVtZXJhbGQnLFxuICAgICAgdGlsZUxheWVyOiAnaHR0cDovL2FwaS50aWxlcy5tYXBib3guY29tL3Y0L21hcGJveC5lbWVyYWxkL3t6fS97eH0ve3l9QDJ4LnBuZz9hY2Nlc3NfdG9rZW49cGsuZXlKMUlqb2liWE5zWldVaUxDSmhJam9pY2xwaVRXVjVTU0o5LlBfaDhyMzd2RDhqcElIMUE2aTFWUmcnLFxuICAgICAgYXR0cmlidXRpb246ICc8YSBocmVmPVwiaHR0cHM6Ly93d3cubWFwYm94LmNvbS9hYm91dC9tYXBzXCI+wqkgTWFwYm94PC9hPiA8YSBocmVmPVwiaHR0cDovL29wZW5zdHJlZXRtYXAub3JnL2NvcHlyaWdodFwiPsKpIE9wZW5TdHJlZXRNYXA8L2E+IHwgPGEgaHJlZj1cImh0dHA6Ly9tYXBib3guY29tL21hcC1mZWVkYmFjay9cIj5JbXByb3ZlIHRoaXMgbWFwPC9hPicsXG4gICAgICBtYXhab29tOiAxOFxuICAgIH0sXG4gICAge1xuICAgICAgbGFiZWw6ICdNYXBib3ggU3RyZWV0cycsXG4gICAgICB0aWxlTGF5ZXI6ICdodHRwOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQvbWFwYm94LnN0cmVldHMve3p9L3t4fS97eX1AMngucG5nP2FjY2Vzc190b2tlbj1way5leUoxSWpvaWJYTnNaV1VpTENKaElqb2ljbHBpVFdWNVNTSjkuUF9oOHIzN3ZEOGpwSUgxQTZpMVZSZycsXG4gICAgICBhdHRyaWJ1dGlvbjogJzxhIGhyZWY9XCJodHRwczovL3d3dy5tYXBib3guY29tL2Fib3V0L21hcHNcIj7CqSBNYXBib3g8L2E+IDxhIGhyZWY9XCJodHRwOi8vb3BlbnN0cmVldG1hcC5vcmcvY29weXJpZ2h0XCI+wqkgT3BlblN0cmVldE1hcDwvYT4gfCA8YSBocmVmPVwiaHR0cDovL21hcGJveC5jb20vbWFwLWZlZWRiYWNrL1wiPkltcHJvdmUgdGhpcyBtYXA8L2E+JyxcbiAgICAgIG1heFpvb206IDE4XG4gICAgfSxcbiAgICB7XG4gICAgICBsYWJlbDogJ01hcGJveCBPdXRkb29ycycsXG4gICAgICB0aWxlTGF5ZXI6ICdodHRwOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQvbWFwYm94Lm91dGRvb3JzL3t6fS97eH0ve3l9QDJ4LnBuZz9hY2Nlc3NfdG9rZW49cGsuZXlKMUlqb2liWE5zWldVaUxDSmhJam9pY2xwaVRXVjVTU0o5LlBfaDhyMzd2RDhqcElIMUE2aTFWUmcnLFxuICAgICAgYXR0cmlidXRpb246JzxhIGhyZWY9XCJodHRwczovL3d3dy5tYXBib3guY29tL2Fib3V0L21hcHNcIj7CqSBNYXBib3g8L2E+IDxhIGhyZWY9XCJodHRwOi8vb3BlbnN0cmVldG1hcC5vcmcvY29weXJpZ2h0XCI+wqkgT3BlblN0cmVldE1hcDwvYT4gfCA8YSBocmVmPVwiaHR0cDovL21hcGJveC5jb20vbWFwLWZlZWRiYWNrL1wiPkltcHJvdmUgdGhpcyBtYXA8L2E+JyxcbiAgICAgIG1heFpvb206IDE4XG4gICAgfSxcbiAgICB7XG4gICAgICBsYWJlbDogJ01hcGJveCBTdHJlZXRzIFNhdGVsbGl0ZScsXG4gICAgICB0aWxlTGF5ZXI6ICdodHRwOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQvbWFwYm94LnN0cmVldHMtc2F0ZWxsaXRlL3t6fS97eH0ve3l9QDJ4LnBuZz9hY2Nlc3NfdG9rZW49cGsuZXlKMUlqb2liWE5zWldVaUxDSmhJam9pY2xwaVRXVjVTU0o5LlBfaDhyMzd2RDhqcElIMUE2aTFWUmcnLFxuICAgICAgYXR0cmlidXRpb246JzxhIGhyZWY9XCJodHRwczovL3d3dy5tYXBib3guY29tL2Fib3V0L21hcHNcIj7CqSBNYXBib3g8L2E+IDxhIGhyZWY9XCJodHRwOi8vb3BlbnN0cmVldG1hcC5vcmcvY29weXJpZ2h0XCI+wqkgT3BlblN0cmVldE1hcDwvYT4gfCA8YSBocmVmPVwiaHR0cDovL21hcGJveC5jb20vbWFwLWZlZWRiYWNrL1wiPkltcHJvdmUgdGhpcyBtYXA8L2E+JyxcbiAgICAgIG1heFpvb206IDE4XG4gICAgfSxcbiAgICB7XG4gICAgICBsYWJlbDogJ29zbS5vcmcnLFxuICAgICAgdGlsZUxheWVyOiAnaHR0cHM6Ly97c30udGlsZS5vcGVuc3RyZWV0bWFwLm9yZy97en0ve3h9L3t5fS5wbmcnLFxuICAgICAgYXR0cmlidXRpb246ICfCqSA8YSBocmVmPVwiaHR0cDovL3d3dy5vcGVuc3RyZWV0bWFwLm9yZy9jb3B5cmlnaHQvZW5cIj5PcGVuU3RyZWV0TWFwPC9hPiBjb250cmlidXRvcnMnLFxuICAgICAgbWF4Wm9vbTogMThcbiAgICB9LFxuICAgIHtcbiAgICAgIGxhYmVsOiAnb3NtLmRlJyxcbiAgICAgIHRpbGVMYXllcjogJ2h0dHA6Ly97c30udGlsZS5vcGVuc3RyZWV0bWFwLmRlL3RpbGVzL29zbWRlL3t6fS97eH0ve3l9LnBuZycsXG4gICAgICBhdHRyaWJ1dGlvbjogJ8KpIDxhIGhyZWY9XCJodHRwOi8vd3d3Lm9wZW5zdHJlZXRtYXAub3JnL2NvcHlyaWdodC9lblwiPk9wZW5TdHJlZXRNYXA8L2E+IGNvbnRyaWJ1dG9ycycsXG4gICAgICBtYXhab29tOiAxOFxuICAgIH1cbiAgXVxuXG59O1xuXG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHVybCA9IHJlcXVpcmUoJ3VybCcpLFxuICAgIGpzb25wID0gcmVxdWlyZSgnanNvbnAnKTtcblxuZnVuY3Rpb24gX2Zvcm1hdENvb3JkKGxhdExuZylcbntcbiAgdmFyIHByZWNpc2lvbiA9IDY7XG4gIGlmICghbGF0TG5nKSB7XG4gICByZXR1cm5cbn1cbiAgLy8gY29uc29sZS5sb2cobGF0TG5nKTtcbiAgLy8gcmVhZCB0aGUgdmFyIF5cbiAgLy8gY29uc29sZS5sb2codHlwZW9mIGxhdExuZy5sYXQudG9GaXhlZChwcmVjaXNpb24pKTtcbiAgLy8gY29uc29sZS5sb2cobGF0TG5nLmxhdC50b0ZpeGVkKHByZWNpc2lvbikpO1xuICAvLyBjaGVjayB3aGF0IHR5cGUgb2YgdmFsdWUgaXQgaXMgXlxuXG4gIHJldHVybiBsYXRMbmcubGF0LnRvRml4ZWQocHJlY2lzaW9uKSArIFwiLFwiICsgbGF0TG5nLmxuZy50b0ZpeGVkKHByZWNpc2lvbik7XG5cbn1cblxuLy8gY29uc29sZS5sb2coX2Zvcm1hdENvb3JkKHtsYXQ6IDMyLjMzMywgbG5nOiAxNC4xMn0pKTtcbiAgLy8gcGFzcyB2YWx1ZSB0byByZXR1cm5cblxuXG5mdW5jdGlvbiBfcGFyc2VDb29yZChjb29yZFN0cilcbntcbiAgdmFyIGxhdExuZyA9IGNvb3JkU3RyLnNwbGl0KCcsJyksXG4gICAgICBsYXQgPSBwYXJzZUZsb2F0KGxhdExuZ1swXSksXG4gICAgICBsb24gPSBwYXJzZUZsb2F0KGxhdExuZ1sxXSk7XG5cbi8vIGNvbnNvbGUubG9nKGxhdExuZylcbiAgaWYgKGlzTmFOKGxhdCkgfHwgaXNOYU4obG9uKSkge1xuICAgIHRocm93IHtuYW1lOiAnSW52YWxpZENvb3JkcycsIG1lc3NhZ2U6IFwiXFxcIlwiICsgY29vcmRTdHIgKyBcIlxcXCIgaXMgbm90IGEgdmFsaWQgY29vcmRpbmF0ZS5cIn07XG4gIH1cblxuICByZXR1cm4gTC5sYXRMbmcobGF0LGxvbik7XG59XG5cbi8vIGNvbnNvbGUubG9nKF9wYXJzZUNvb3JkLmNvb3JkU3RyKTtcbi8vIGNvbnNvbGUubG9nKGNvb3JkU3RyKTtcbi8vIGNvbnNvbGUubG9nKF9wYXJzZUNvb3JkKHtsYXQ6IDMyLjMzMywgbG5nOiAxNC4xMn0pKTtcblxuZnVuY3Rpb24gX3BhcnNlSW50ZWdlcihpbnRTdHIpXG57XG4gIHZhciBpbnRlZ2VyID0gcGFyc2VJbnQoaW50U3RyKTtcblxuICBpZiAoaXNOYU4oaW50ZWdlcikpIHtcbiAgICB0aHJvdyB7bmFtZTogJ0ludmFsaWRJbnQnLCBtZXNzYWdlOiBcIlxcXCJcIiArIGludFN0ciArIFwiXFxcIiBpcyBub3QgYSB2YWxpZCBpbnRlZ2VyLlwifTtcbiAgfVxuXG4gIHJldHVybiBpbnRlZ2VyO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRMaW5rKGJhc2VVUkwsIG9wdGlvbnMpXG57XG4gIHZhciBwYXJzZWQgPSB1cmwucGFyc2UoYmFzZVVSTCksXG4gICAgICBmb3JtYXRlZCA9IHVybC5mb3JtYXQoe1xuICAgICAgICBwcm90b2NvbDogcGFyc2VkLnByb3RvY29sLFxuICAgICAgICBob3N0OiBwYXJzZWQuaG9zdCxcbiAgICAgICAgcGF0aG5hbWU6IHBhcnNlZC5wYXRobmFtZSxcbiAgICAgICAgcXVlcnk6IHtcbiAgICAgICAgICB6OiBvcHRpb25zLnpvb20sXG4gICAgICAgICAgY2VudGVyOiBvcHRpb25zLmNlbnRlciA/IF9mb3JtYXRDb29yZChvcHRpb25zLmNlbnRlcikgOiB1bmRlZmluZWQsXG4gICAgICAgICAgbG9jOiBvcHRpb25zLndheXBvaW50cyA/IG9wdGlvbnMud2F5cG9pbnRzLmZpbHRlcihmdW5jdGlvbih3cCkgeyByZXR1cm4gd3AubGF0TG5nICE9PSB1bmRlZmluZWQ7fSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAubWFwKGZ1bmN0aW9uKHdwKSB7cmV0dXJuIHdwLmxhdExuZzt9KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5tYXAoX2Zvcm1hdENvb3JkKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICAgICAgaGw6IG9wdGlvbnMubGFuZ3VhZ2UsXG4gICAgICAgICAgbHk6IG9wdGlvbnMubGF5ZXIsXG4gICAgICAgICAgYWx0OiBvcHRpb25zLmFsdGVybmF0aXZlLFxuICAgICAgICAgIGRmOiBvcHRpb25zLnVuaXRzLFxuICAgICAgICAgIHNydjogb3B0aW9ucy5zZXJ2aWNlLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cdC8vIG5vIGxheWVyLCBubyBzZXJ2aWNlXG4gIHJldHVybiBmb3JtYXRlZDtcbn1cblxuZnVuY3Rpb24gcGFyc2VMaW5rKGxpbmspXG57XG4gIGxpbmsgPSAnPycgKyBsaW5rLnNsaWNlKDEpO1xuXG4gIHZhciBwYXJzZWQgPSB1cmwucGFyc2UobGluaywgdHJ1ZSksXG4gICAgICBxID0gcGFyc2VkLnF1ZXJ5LFxuICAgICAgcGFyc2VkVmFsdWVzID0ge30sXG4gICAgICBvcHRpb25zID0ge30sXG4gICAgICBrO1xuXG4gIHRyeSB7XG4gICAgcGFyc2VkVmFsdWVzLnpvb20gICAgICA9IHEuem9vbSAgICYmIF9wYXJzZUludGVnZXIocS56b29tKTtcbiAgICBwYXJzZWRWYWx1ZXMuY2VudGVyICAgID0gcS5jZW50ZXIgJiYgX3BhcnNlQ29vcmQocS5jZW50ZXIpO1xuXHQvLyBjb25zb2xlLmxvZyhxLmxvYyk7XG4gICAgcGFyc2VkVmFsdWVzLndheXBvaW50cyA9IHEubG9jICAgICYmIHEubG9jLm1hcChfcGFyc2VDb29yZCkubWFwKFxuICAgICAgZnVuY3Rpb24gKGNvb3JkKSB7XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKGNvb3JkKTtcbiAgICAgICAgcmV0dXJuIEwuUm91dGluZy53YXlwb2ludChjb29yZCk7XG4gICAgICB9XG4gICAgKTtcbiAgICBwYXJzZWRWYWx1ZXMubGFuZ3VhZ2UgPSBxLmhsO1xuICAgIHBhcnNlZFZhbHVlcy5hbHRlcm5hdGl2ZSA9IHEuYWx0O1xuICAgIHBhcnNlZFZhbHVlcy51bml0cyA9IHEuZGY7XG4gICAgcGFyc2VkVmFsdWVzLmxheWVyID0gcS5seTtcbiAgICBwYXJzZWRWYWx1ZXMuc2VydmljZSA9IHEuc3J2O1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5sb2coXCJFeGNlcHRpb24gXCIgKyBlLm5hbWUgKyBcIjogXCIgKyBlLm1lc3NhZ2UpO1xuICB9XG5cbiAgZm9yIChrIGluIHBhcnNlZFZhbHVlcylcbiAge1xuICAgIGlmIChwYXJzZWRWYWx1ZXNba10gIT09IHVuZGVmaW5lZCAmJiBwYXJzZWRWYWx1ZXNba10gIT09IFwiXCIpXG4gICAge1xuICAgICAgb3B0aW9uc1trXSA9IHBhcnNlZFZhbHVlc1trXTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gb3B0aW9ucztcbn1cblxudmFyIFNob3J0ZW5lciA9IEwuQ2xhc3MuZXh0ZW5kKHtcbiAgb3B0aW9uczoge1xuICAgIGJhc2VVUkw6ICdodHRwOi8vc2hvcnQucHJvamVjdC1vc3JtLm9yZy8nXG4gIH0sXG5cbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIEwuVXRpbC5zZXRPcHRpb25zKHRoaXMsIG9wdGlvbnMpO1xuICB9LFxuXG4gIHNob3J0ZW46IGZ1bmN0aW9uKGxpbmssIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlcXVlc3RVUkwgPSB0aGlzLm9wdGlvbnMuYmFzZVVSTCArIGxpbms7XG4gICAganNvbnAocmVxdWVzdFVSTCwge3BhcmFtOiAnanNvbnAnfSxcbiAgICAgIGZ1bmN0aW9uKGVycm9yLCByZXNwKSB7XG4gICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgIGNvbnNvbGUubG9nKFwiRXJyb3I6IFwiICsgZXJyb3IpO1xuICAgICAgICAgIGNhbGxiYWNrLmNhbGwoY29udGV4dCwgXCJcIik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXNwLlNob3J0VVJMID09PSB1bmRlZmluZWQpXG4gICAgICAgIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcIkVycm9yOiBcIiArIHJlc3AuRXJyb3IpO1xuICAgICAgICAgIGNhbGxiYWNrLmNhbGwoY29udGV4dCwgXCJcIik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNhbGxiYWNrLmNhbGwoY29udGV4dCwgcmVzcC5TaG9ydFVSTCk7XG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICdwYXJzZSc6IHBhcnNlTGluayxcbiAgJ2Zvcm1hdCc6IGZvcm1hdExpbmssXG4gICdzaG9ydGVuZXInOiBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgcmV0dXJuIG5ldyBTaG9ydGVuZXIob3B0aW9ucyB8fCB7fSk7XG4gIH1cbn07XG4iXX0=
