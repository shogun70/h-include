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

    parse_html: function(markup) {
        return (new DOMParser).parseFromString(markup, 'text/html');
    },
    check_recursion: function(element) {
      // Check for recursion against current browser location
      if(element.getAttribute('src') === document.location.href) {
        throw new Error('Recursion not allowed');
      }

      // Check for recursion is ascendents
      var elementToCheck = element.parentNode;
      while (elementToCheck.parentNode) {
        if (elementToCheck.nodeName === 'H-INCLUDE') {

          if (element.getAttribute('src') === elementToCheck.getAttribute('src')) {
            throw new Error('Recursion not allowed');
          }
        }

        elementToCheck = elementToCheck.parentNode;
      }
    },
    show_content: function (element, req) {
      var i, include, message, fragment = element.getAttribute('fragment') || 'body';
      if (req.status === 200 || req.status === 304) {
        var parseHTML = element.parseHTML || hinclude.parse_html;
        var doc = parseHTML(req.responseText);

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

      hinclude.check_recursion(element);

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

    hinclude.include(this, this.getAttribute("src"), this.getAttribute("media"), callback);
  };

  proto.refresh = function () {
    var callback = hinclude.set_content_buffered;
    hinclude.include(this, this.getAttribute("src"), this.getAttribute("media"), callback);
  };

  document.registerElement('h-include', {
    prototype : proto
  });
}());
