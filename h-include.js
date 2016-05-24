/*
h-include.js -- HTML Includes (version 1.0.0)

MIT License

Copyright (c) 2016 Gustaf Nilsson Kotte <gustaf.nk@gmail.com>
Copyright (c) 2005-2012 Mark Nottingham <mnot@mnot.net>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

------------------------------------------------------------------------------

See http://gustafnk.github.com/h-include/ for documentation.
*/

/*jslint indent: 2, browser: true, vars: true, nomen: true */
/*global alert, ActiveXObject */

var hinclude;

(function () {

  "use strict";

  if (!window.console) return;
  if (!window.XMLHttpRequest) {
    console.warn('hinclude.js is in fallback mode because of a missing requirement: native XMLHttpRequest');
    return;
  }

  // Test for HTML in DOMParser
  try {
    var doc = (new DOMParser).parseFromString('<!DOCTYPE html><title>Test</title><p>Test', 'text/html');
  }
  catch (error) {
    // NOTE old Safari doesn't throw, but doesn't generate a document either
  }
  if (!doc) {
    console.warn('hinclude.js is in fallback mode because of a missing requirement: HTML parsing in DOMParser');
    return;
  }

  hinclude = {
    classprefix: "include_",

    show_content: function (element, req) {
      var i, include, message, fragment = element.getAttribute('fragment') || 'body';
      if (req.status === 200 || req.status === 304) {
        var doc = (new DOMParser).parseFromString(req.responseText, 'text/html');
        var src = element.src;
        resolve_all(doc, src);

        var node = doc.querySelector(fragment);

        if (!node) {
          console.warn("Did not find fragment in response");
          return;
        }

        element.innerHTML = node.innerHTML;
        
        element.onSuccess && element.onSuccess();
      }
      element.className = hinclude.classprefix + req.status;
    },

    set_content_async: function (element, req) {
      if (req.readyState === 4) {
        hinclude.show_content(element, req);
      }
    },

    buffer: [],
    set_content_buffered: function (element, req) {
      if (req.readyState === 4) {
        hinclude.buffer.push([element, req]);
        hinclude.outstanding -= 1;
        if (hinclude.outstanding === 0) {
          hinclude.show_buffered_content();
        }
      }
    },

    show_buffered_content: function () {
      var include;
      while (hinclude.buffer.length > 0) {
        include = hinclude.buffer.pop();
        hinclude.show_content(include[0], include[1]);
      }
    },

    outstanding: 0,

    include: function (element, url, media, incl_cb) {

      // Check for recursion against current browser location
      // FIXME the comparision should ignore #hash differences
      var src = element.src;
      if(src === document.location.href) {
        throw new Error('Recursion not allowed');
      }

      // Check for recursion is ascendents
      var elementToCheck = element.parentNode;
      while (elementToCheck.parentNode) {
        if (elementToCheck.nodeName === 'H-INCLUDE') {

          if (src === elementToCheck.src) {
            throw new Error('Recursion not allowed');
          }
        }

        elementToCheck = elementToCheck.parentNode;
      }

      if (media && window.matchMedia && !window.matchMedia(media).matches) {
        return;
      }
      var scheme = url.substring(0, url.indexOf(":"));
      if (scheme.toLowerCase() === "data") { // just text/plain for now
        var data = decodeURIComponent(url.substring(url.indexOf(",") + 1, url.length));
        element.innerHTML = data;
      } else {
        var req = new XMLHttpRequest();
        if (req) {
          this.outstanding += 1;
          req.onreadystatechange = function () {
            incl_cb(element, req);
          };
          try {
            req.open("GET", url, true);
            req.send("");
          } catch (e3) {
            this.outstanding -= 1;
            console.warn("Include error: " + url + " (" + e3 + ")");
          }
        }
      }
    },
    metaCache: {},
    get_meta: function (name, value_default) {

      // Since get_meta is called on each createdCallback, we use caching
      var cached = this.metaCache[name];
      if (cached) {
        return cached;
      }

      var m = 0;
      var metas = document.getElementsByTagName("meta");
      var meta_name, meta_value;
      for (m; m < metas.length; m += 1) {
        meta_name = metas[m].getAttribute("name");
        if (meta_name === name) {
          meta_value = metas[m].getAttribute("content");
          this.metaCache[name] = meta_value;
          return meta_value;
        }
      }
      return value_default;
    }
  };

  var proto = Object.create(window.HTMLElement.prototype);

  proto.attributeChangedCallback = function (attrName) {
    if (attrName === 'src') {
      this.refresh();
    }
  };

  proto.attachedCallback = function () {

    var mode = hinclude.get_meta("include_mode", "buffered");
    var callback;

    if (mode === "async") {
      callback = hinclude.set_content_async;
    } else if (mode === "buffered") {
      callback = hinclude.set_content_buffered;
      var timeout = hinclude.get_meta("include_timeout", 2.5) * 1000;
      setTimeout(hinclude.show_buffered_content, timeout);
    }

    hinclude.include(this, this.src, this.getAttribute("media"), callback);
  };

  proto.refresh = function () {
    var callback = hinclude.set_content_buffered;
    hinclude.include(this, this.src, this.getAttribute("media"), callback);
  };

  Object.defineProperty(proto, 'src', {
    get: function() { 
      return resolve_url(this.getAttribute('src'), this.ownerDocument); 
    },
    set: function(src) { 
      this.setAttribute('src', src); 
    }
  });

  document.registerElement('h-include', {
    prototype : proto
  });


  /* URL resolver for HTML document */
  // TODO doesn't handle @srcset, a@ping, probably others

  // The urlAttributes definition string uses lower-case tagNames 
  // and attribute *property* names
  var urlAttributes = 'link@href script@src img@longDesc,src iframe@longDesc,src object@data embed@src video@poster,src audio@src source@src input@formAction,src button@formAction,src a@href area@href q@cite blockquote@cite ins@cite del@cite form@action';

  // TODO what about URLs on custom-elements?  
  urlAttributes += ' h-include@src';

  var urlAttributeMap = {
    // keys are lower-case tagNames
    // values are an attribute-list
  };
  urlAttributes.split(/\s+/).forEach(function(text) {
    var m = text.split('@'), tagName = m[0], attrs = m[1];
    urlAttributeMap[tagName] = attrs.split(',');
  });
  
  function resolve_url(relURL, doc) { // fully resolve a URL relative to doc
    // TODO this would be quicker in pure JS rather than using DOM
    if (!doc) doc = document;
    var link = doc.createElement('a');
    link.href = relURL;
    return link.href;
  }

  function resolve_all(doc, baseURL) { // fully resolve all URLs in doc
    // if doc has no `<base href>` then add one
    if (!baseURL) baseURL = document.URL;
    else baseURL = resolve_url(baseURL);

    var base; 
    if (!doc.querySelector('base[href]')) {
      base = doc.createElement('base');
      base.href = baseURL;
      doc.head.insertBefore(base, doc.head.firstChild);
    }

    forOwn(urlAttributeMap, function(attrs, tag) {
      forEach(doc.querySelectorAll(tag), function(el) {
        forEach(attrs, function(attr) { 
          if (!el.hasAttribute(attr)) return;

          // Resolving h-include@src could take either code-path below.
          // If the registered-elements of `document` also apply to 
          // documents created by DOMParser (currently not the case)
          // then it will use the former.
          // This would call the `.src` getter defined in `hinclude`.
          // The polyfill will always follow the latter path.

          if (attr in el) {
            el[attr] = el[attr];
          }
          else {
            var href = el.getAttribute(attr);
            href = resolve_url(href, doc);
            el.setAttribute(attr, href);
          }
        });
      });
    });

    if (base) base.parentNode.removeChild(base);
  }

  function forOwn(map, callback, context) { // modelled on lodash.forOwn
    for (var slot in map) callback.call(context, map[slot], slot, map);
  }

  function forEach(array, callback, context) { // modelled on lodash.forEach
    for (var n=array.length, i=0; i<n; i++) callback.call(context, array[i], i, array);
  } 

}());
