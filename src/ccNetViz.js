import ccNetViz_layer         from './layer';
import ccNetViz_layout        from './layout/layout';
import ccNetViz_gl            from'./gl';
import ccNetViz_color         from './color';
import ccNetViz_utils         from './utils';
import ccNetViz_textures      from './dataSources/textures';
import ccNetViz_files         from './dataSources/files';
import ccNetViz_texts         from './texts/texts' ;
import ccNetViz_lazyEvents    from './lazyEvents';
import ccNetViz_interactivityBatch from './interactivityBatch';
import ccNetViz_spatialSearch from './spatialSearch/spatialSearch';
import {getPartitionStyle}    from './primitiveTools' ;

/**
 *  Copyright (c) 2016, Helikar Lab.
 *  All rights reserved.
 *
 *  This source code is licensed under the GPLv3 License.
 *  Authors:
 *  David Tichy
 *    Aleš Saska - http://alessaska.cz/
 */

let sCanvas = document.createElement("canvas");
function getContext(canvas){
    let attributes = { depth: false, antialias: false };
    let gl = canvas.getContext('webgl', attributes) || canvas.getContext('experimental-webgl', attributes);

    return gl;
}


var lastUniqId = 0;

function checkUniqId(el){
  if(el.__uniqid !== undefined){
    el.uniqid = el.__uniqid;
    delete el.__uniqid;
  }else if(el.uniqid === undefined){
    el.uniqid = ++lastUniqId;
  }
}

/* Code for unidirectional graphs  GSoC 2017*/
var uniqObj = {};
var uniqObjArray = [];

function checkUniqIdForUnidirectional(el) {
    if (el.__uniqid !== undefined) {
        el.uniqid = el.__uniqid;
        delete el.__uniqid;
    } else if (el.uniqid === undefined) {
        var sUid = el.source.uniqid || el.source;
        var tUid = el.target.uniqid || el.target;
        if (sUid > tUid) {
            var temp = sUid;
            sUid = tUid;
            tUid = temp;
        }
        var index = sUid + ":" + tUid;
        if (!uniqObj[index]) {
            el.uniqid = ++lastUniqId;
            uniqObj[index] = el.uniqid;
            uniqObjArray.push(el);
        } else {
            el.uniqid = uniqObj[index];
        }
    }
}

/* code for unidirectional graphs ends GSoC 17 */
function mergeArrays(a, b, cmp){
  let r = [];
  r.length = a.length + b.length;

  let i = 0,j=0,k=0;

  while (i < a.length && j < b.length)
  {
    if (cmp(a[i],b[j]) < 0)
      r[k++] = a[i++];
    else
      r[k++] = b[j++];
  }

  while (i < a.length)
    r[k++] = a[i++];


  while (j < b.length)
    r[k++] = b[j++];

  return r;
}

var ccNetViz = function(canvas, options){
  let self = this;
  canvas = canvas || sCanvas;

  let backgroundStyle = options.styles.background = options.styles.background || {};
  let backgroundColor = new ccNetViz_color(backgroundStyle.color || "rgb(255, 255, 255)");

  let removed = false;
  let setted  = false;

  let nodeStyle = options.styles.node = options.styles.node || {};
  nodeStyle.minSize = nodeStyle.minSize != null ? nodeStyle.minSize : 6;
  nodeStyle.maxSize = nodeStyle.maxSize || 16;
  nodeStyle.color = nodeStyle.color || "rgb(255, 255, 255)";

  if (nodeStyle.label) {
      let s = nodeStyle.label;
      s.color = s.color || "rgb(120, 120, 120)";
      s.font = s.font || {type:"Arial, Helvetica, sans-serif", size: 11};
  }

  let edgeStyle = options.styles.edge = options.styles.edge || {};
  edgeStyle.width = edgeStyle.width || 1;
  edgeStyle.color = edgeStyle.color || "rgb(204, 204, 204)";

  let onLoad = () => { if(!options.onLoad || options.onLoad()){this.draw(true);} };

  if (edgeStyle.arrow) {
      let s = edgeStyle.arrow;
      s.minSize = s.minSize != null ? s.minSize : 6;
      s.maxSize = s.maxSize || 12;
      s.aspect = 1;
  }


  let events = new ccNetViz_lazyEvents();
  let layers = {};
  let view,gl,drawFunc,textures,files,texts;
  let context = {};

  this.cntShownNodes = () => {
    let n = 0;
    for(var k in layers)
      n += layers[k].cntShownNodes();
    return n;
  }
  let getNodesCnt = options.getNodesCnt || this.cntShownNodes;

  this.cntShownEdges = () => {
    let e = 0;
    for(var k in layers)
      e += layers[k].cntShownEdges();
    return e;
  }
  let getEdgesCnt = options.getEdgesCnt || this.cntShownEdges;

  let onRedraw = events.debounce(() => {
    self.draw.call(self);
    return false;
  }, 5);

  function checkRemoved(){
    if(removed){
      console.error("Cannot call any function on graph after remove()")
      return true;
    }
    return false;
  }

  let nodes, edges;

  function insertTempLayer(){
    if(layers.temp)
      return;
    layers.temp = new ccNetViz_layer(canvas, context, view, gl, textures, files, texts, events, options, backgroundColor, nodeStyle, edgeStyle, getSize, getNodeSize, getLabelSize, getLabelHideSize, getNodesCnt, getEdgesCnt, onRedraw, onLoad);
  }

  let batch = undefined;
  function getBatch(){
    if(!batch)
      batch = new ccNetViz_interactivityBatch(layers, insertTempLayer, drawFunc, nodes, edges, checkUniqId);
    return batch;
  };

  this.set = (n, e, layout) => {
    if(checkRemoved()) return this;
    nodes = n || [];
    edges = e || [];

    nodes.forEach(checkUniqId);
    var undirected = options.styles.undirected;
    var chekUniqFn = undirected ? checkUniqIdForUnidirectional : checkUniqId;
    edges.forEach(chekUniqFn);
    if(undirected){
      edges = uniqObjArray;
    }

    layers.temp && layers.temp.set([], [], layout);
    layers.main.set(nodes, edges, layout);

    //reset batch
    batch = undefined;
    setted = true;
    return this;
  };

  //make all dynamic changes static
  this.reflow = () => {
    if(checkRemoved()) return;

    getBatch().applyChanges();

    //nodes and edges in dynamic chart are actual
    let n = layers.main.getVisibleNodes();
    if(layers.temp)  n = n.concat(layers.temp.getVisibleNodes());

    let e = layers.main.getVisibleEdges();
    if(layers.temp) e = e.concat(layers.temp.getVisibleEdges());

    this.set(n,e);
    this.draw();
  };

  this.removeNode = (n) => { if(checkRemoved()){return this;} getBatch().removeNode(n); return this; };
  this.removeEdge = (e) => { if(checkRemoved()){return this;} getBatch().removeEdge(e); return this; };
  this.addEdge = (e) => { if(checkRemoved()){return this;} getBatch().addEdge(e); return this;};
  this.addNode = (n) => { if(checkRemoved()){return this;} getBatch().addNode(n); return this;};
  this.updateNode = (n) => { if(checkRemoved()){return this;} return this.removeNode(n).addNode(n); };
  this.updateEdge = (e) => { if(checkRemoved()){return this;} return this.removeEdge(e).addEdge(e); };
  this.applyChanges = () => { if(checkRemoved()){return this;} getBatch().applyChanges(); return this; };

  this.addEdges = (edges) => {
    if(checkRemoved()) return this;

    edges.forEach((e) => {
      this.addEdge(e);
    });

    return this;
  };

  this.addNodes = (nodes) => {
    if(checkRemoved()) return this;

    nodes.forEach((n) => {
      this.addNode(n);
    });

    return this;
  };

  this.removeEdges = (edges) => {
    if(checkRemoved()) return this;

    edges.forEach((e) => {
      this.removeEdge(e);
    });
    return this;
  };

  this.removeNodes = (nodes) => {
    if(checkRemoved()) return this;

    nodes.forEach((n) => {
      this.removeNode(n);
    });
    return this;
  };

  this.updateNodes = (nodes) => {
    if(checkRemoved()) return this;

    nodes.forEach((n) => {
      this.updateNode(n);
    });

    return this;
  };

  this.updateEdges = (edges) => {
    if(checkRemoved()) return this;

    edges.forEach((e) => {
      this.updateEdge(e);
    });

    return this;
  };


  let getSize = (c, s, n, sc) => {
    let result = sc * Math.sqrt(c.width * c.height / (n+1)) / view.size;
    if (s) {
      let min = s.size ? s.size : s.minSize;
      let max = s.size ? s.size : s.maxSize;

      result = max ? Math.min(max, result) : result;
      if(result < s.hideSize)
        return 0;
      result = min ? Math.max(min, result) : result;
    }
    return result;
  };

  let getNodeSize = c => getSize(c, c.style, getNodesCnt(), 0.4);
  let getLabelSize = (c,s) => getSize(c, s, getNodesCnt(), 0.25);

  let getLabelHideSize = (c,s) => {
    if(s){
        const sc = 0.25;
        let n = layers.main.cntShownNodes();  //lower bound
        let t = sc * Math.sqrt(c.width * c.height / ( n+1 ) );

        let vs;
        if(s.hideSize){
            vs = t / s.hideSize;
            if(s.maxSize)
                vs = Math.min(vs, t / s.maxSize);
            return vs;
        }
    }

    return 1;
  };

  let offset = 2.0 * nodeStyle.maxSize; //added offset for screenspace GSoC 17
  /* GSoc 17 code for touch events */
    this.enableTouch = function(image){
  		if( /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ) {
  			// some code only for small devices..
  			//alert(44);
  			/*var image = new Image();
  			image.src = this.image();*/
  			var width = canvas.width;
        var height = canvas.height;
        if ( $( "#body" ).length ){
          $( "#container" ).css('position','absolute');
          $( "#container" ).css('visibility','hidden');
        }

  			if ( $( "#mycanvas" ).length ) {
  				//$( "#mycanvas" ).remove();
  				/*
  				$('<canvas>').attr({
  					id: 'mycanvas'
  				}).css({
  					width: width + 'px',
  					height: height + 'px',
  				}).appendTo('#body');
  				$('#mycanvas').css("border","1px solid black");*/
  				//canvas already exists
  			}
  			else{
          if ( $( "#body" ).length ){
            $('<canvas>').attr({
              id: 'mycanvas'
            }).css({
              width: width + 'px',
              height: height + 'px',
            }).appendTo('#body');

            $('#mycanvas').css("border","1px solid black");
          }
  			}

        if ( $( "#body" ).length ){
          var gesturableImg = new ImgTouchCanvas({
            canvas: document.getElementById('mycanvas'),
            path: this.image(),
            desktop: true
          });
        }
  		}
    }
  /* code to enable touch events ends */
  this.draw = (silent) => {
    if(silent && (removed || !setted) ) return;
    if(checkRemoved()) return;

    let width = canvas.width;
    let height = canvas.height;
    let aspect = width / height;
    let o = view.size === 1 ? offset : 0;
    let ox = o / width;
    let oy = o / height;

    context.transform = ccNetViz_gl.ortho(view.x - ox, view.x + view.size + ox, view.y - oy, view.y + view.size + oy, -1, 1);
    context.offsetX   = ox;
    context.offsetY   = oy;
    context.width     = 0.5 * width;
    context.height    = 0.5 * height;
    context.aspect2   = aspect * aspect;
    context.aspect    = aspect;
    context.count     = getNodesCnt();

    //bad hack because we use different size for curveExc and for nodeSize :(
    if(context.style) delete context.style;
    context.curveExc = getSize(context, undefined, getEdgesCnt(), 0.5);
    context.style     = nodeStyle;
    context.nodeSize = getNodeSize(context);

    gl && gl.viewport(0, 0, width, height);

    gl && gl.clear(gl.COLOR_BUFFER_BIT);

    for(let i = 0; i < layers.main.scene.elements.length; i++){
      layers.main.scene.elements[i].draw(context);
      layers.temp && layers.temp.scene.elements[i].draw(context);
    }
    this.enableTouch(); //including the enable touch function
  };
  drawFunc = this.draw.bind(this);

  this.getScreenCoords = function(conf){
    if(checkRemoved()) return;
    let ret = {};
    let rect = canvas.getBoundingClientRect();
    if(conf.x !== undefined) ret.x = (conf.x - view.x + context.offsetX) / (view.size + 2*context.offsetX) * canvas.width + rect.left;
    if(conf.y !== undefined) ret.y = ( 1 - ( conf.y - view.y + context.offsetY) / (view.size + 2*context.offsetY) )  * canvas.height + rect.top;
    return ret;
  };

  this.getLayerCoords = function(conf){
    if(checkRemoved()) return;

    let ret = {};

    ['x','x1','x2'].forEach(k => {
      if(conf[k] !== undefined){
        let x = conf[k];
        x = (x/canvas.width)*(view.size+2*context.offsetX)-context.offsetX+view.x;
        ret[k] = x;
      }
    });


    ['y','y1','y2'].forEach(k => {
      if(conf[k] !== undefined){
        let y = conf[k];
        y = (1-y/canvas.height)*(view.size+2*context.offsetY)-context.offsetY+view.y;
        ret[k] = y;
      }
    });

    if(conf.radius !== undefined){
      let dist = conf.radius;

      let disth = dist / canvas.height;
      let distw = dist / canvas.width;
      dist = Math.max(disth, distw) * view.size;

      ret.radius = dist;
    }

    return ret;
  }

  let findMerge = function(funcname, args){
    if(checkRemoved() || !gl) return;

    let f1 = layers.main[funcname].apply(layers.main, args);

    if(!layers.temp)
      return f1;

    let f2 = layers.temp[funcname].apply(layers.temp, args);

    let r = {};
    for(let key in f1){
      r[key] = mergeArrays(f1[key], f2[key], (e1, e2) => {
        return e1.dist2 - e2.dist2;
      });
    }

    return r;
  };

  this.find = function(){return findMerge('find', arguments); };
  this.findArea = function(){return findMerge('findArea', arguments); };

  this.getTextPosition = (n) => {
    if(checkRemoved() || !gl) return;

    const offset = 0.5 * context.nodeSize;
    const offsety = (2.0 * (n.y <=  0.5 ? 0 : 1) - 1.0) * offset;

    let ns = getPartitionStyle(options.styles[n.style],nodeStyle,"label");
    let textEngine = texts.getEngine(ns.font);
    textEngine.setFont(ns.font);

    let wantedSize = ( textEngine.isSDF ? getLabelSize(context, ns.label || {}) : textEngine.fontSize );
    let fontScale = wantedSize / textEngine.fontSize; if(wantedSize === 0){ fontScale = 0; };

    return {offsetY: offsety, fontScale: fontScale, chars: textEngine.get(n.label, n.x, n.y)};
  };



  let addEvts = (el, evts) => {
    for(var k in (evts || {})){
      evts[k] && el.addEventListener(k, evts[k]);
    }
  }

  let removeEvts = (el, evts) => {
    for(var k in (evts || {})){
      evts[k] && el.removeEventListener(k, evts[k]);
    }
  }

  let onDownThis = onMouseDown.bind(this);

  let zoomevts;
  addEvts(canvas, zoomevts = {
    'mousedown': onDownThis,
    'touchstart': onDownThis,
    'wheel': onWheel.bind(this),
    'contextmenu': options.onContextMenu
  })

  this.remove = () => {
    if(checkRemoved()) return;

    for(var k in layers){layers[k].remove();}

    if(gl){
      gl.viewport(0, 0, context.width*2, context.height*2);
      gl.clear(gl.COLOR_BUFFER_BIT);

      let gl_lose = gl.getExtension('WEBGL_lose_context');
      gl_lose && gl_lose.loseContext();
    }

    removeEvts(canvas, zoomevts);

    events.disable();
    texts && texts.remove();

    removed = true;
  }

  let last_view = {};
  function checkChangeViewport(){
    let is_change = false;
    if(last_view){
      for(let k in view){
        if(last_view[k] !== view[k])
          is_change = true;
      }
    }
    ccNetViz_utils.extend(last_view, view);

    if(is_change){
      options.onChangeViewport && options.onChangeViewport(view);
    }
  }

  function onContextMenu(e){
  }

  function onWheel(e) {
      let rect = canvas.getBoundingClientRect();
      let size = Math.min(1.0, view.size * (1 + 0.001 * (e.deltaMode ? 33 : 1) * e.deltaY));
      let delta = size - view.size;

      e.preventDefault();

      let oldsize = view.size;
      let oldx = view.x;
      let oldy = view.y;


      view.size = size;
      view.x = Math.max(0, Math.min(1 - size, view.x - delta * (e.clientX - rect.left) / canvas.width));
      view.y = Math.max(0, Math.min(1 - size, view.y - delta * (1 - (e.clientY - rect.top) / canvas.height)));

      if(options.onZoom && options.onZoom(view) === false){
        view.size = oldsize;
        view.x = oldx;
        view.y = oldy;
        return;
      }

      checkChangeViewport();

      this.draw();
  }

  let lastUpTime = 0;
  function onMouseDown(downe) {
    if(downe.which !== 1) return; //catch only 1 - left mouse button

    let parseTouchEvts = (e) => {
      if(!e.touches) return e;

      let x = 0,y = 0;
      for(let i = 0; i < e.touches.length; i++){ x += e.touches[i].clientX; y += e.touches[i].clientY; }
      e.clientX = x / e.touches.length;
      e.clientY = y / e.touches.length;

      return e;
    }


    downe = parseTouchEvts(downe);


    let width = canvas.width / view.size;
    let height = canvas.height / view.size;
    let sx = downe.clientX;
    let sy = downe.clientY;
    let dx = view.x + sx / width;
    let dy = sy / height - view.y;
    let od = options.onDrag;
    let dragged, custom;
    let panning = true;
    let zooming = false;
    let evts;

    let origdist;
    if((downe.touches || []).length === 2){
      let mx = downe.touches[0].clientX - downe.touches[1].clientX, my = downe.touches[0].clientY - downe.touches[1].clientY;
      origdist = Math.sqrt( mx * mx + my * my );
      zooming = true;
    }


    let drag = e => {
      e = parseTouchEvts(e);

      if(e.touches && e.touches.length != 1)  panning = false;

      if (dragged) {
          if(panning){
              if (custom) {
                  od.drag && od.drag(e);
              }
              else {
                  view.x = Math.max(0, Math.min(1 - view.size, dx - e.clientX / width));
                  view.y = Math.max(0, Math.min(1 - view.size, e.clientY / height - dy));
                  checkChangeViewport();
                  this.draw();
              }
          }
      }
      else {
          let x,y;
          if(e.touches && e.touches.length > 0){ x = e.touches[0].clientX; y = e.touches[0].clientY; } else { x = e.clientX; y = e.clientY; }

          let mx = x - sx;
          let my = y - sy;

          if (mx * mx + my * my > 8) {
              dragged = true;
              custom = od && od.start(downe);
              custom && od.drag && od.drag(e);
          }
      }
      e.preventDefault();
    };

    let up = e => {
        e = parseTouchEvts(e);

        custom && od.stop && od.stop(e);

        if(!dragged){
          options.onClick && options.onClick(e);

          if( new Date().getTime() - lastUpTime < 250 ) {
            options.onDblClick && options.onDblClick(e);
            lastUpTime = 0;
          }else{
            lastUpTime = new Date().getTime();
          }
        }

        removeEvts(window, evts);
    };

    let zoom = e => {
        e = parseTouchEvts(e);

        if(e.touches && e.touches.length == 2){
            let mx = e.touches[0].clientX - e.touches[1].clientX, my = e.touches[0].clientY - e.touches[1].clientY;
            let dist = Math.sqrt(mx * mx + my * my);
            e.deltaY = -(dist - origdist)*5;
            onWheelThis(e);
            origdist = dist;
        }
    };

    addEvts(window, evts = {
      'mouseup': up,
      'touchend': up,
      'touchcancel': up,
      'mousemove': zooming ? zoom : drag,
      'touchmove': zooming ? zoom : drag
    });
  }
  /* Touch events function start GSoC 17*/
    class ImgTouchCanvas {
        constructor(options){
            if( !options || !options.canvas || !options.path) {
                throw 'ImgZoom constructor: missing arguments canvas or path';
            }

            this.canvas         = options.canvas;
            this.canvas.width   = this.canvas.clientWidth;
            this.canvas.height  = this.canvas.clientHeight;
            this.context        = this.canvas.getContext('2d');

            this.desktop = options.desktop || false; //non touch events

            this.position = {
                x: 0,
                y: 0
            };
            this.scale = {
                x: 0.5,
                y: 0.5
            };
            this.imgTexture = new Image();
            this.imgTexture.src = options.path;

            this.lastZoomScale = null;
            this.lastX = null;
            this.lastY = null;

            this.mdown = false; //desktop drag

            this.init = false;
            this.checkRequestAnimationFrame();
            requestAnimationFrame(this.animate.bind(this));

            this.setEventListeners();
        }

        animate() {
            //set scale such as image cover all the canvas
            if(!this.init) {
                if(this.imgTexture.width) {
                    var scaleRatio = null;
                    if(this.canvas.clientWidth > this.canvas.clientHeight) {
                        scaleRatio = this.canvas.clientWidth / this.imgTexture.width;
                    }
                    else {
                        scaleRatio = this.canvas.clientHeight / this.imgTexture.height;
                    }

                    this.scale.x = scaleRatio;
                    this.scale.y = scaleRatio;
                    this.init = true;
                }
            }

            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

            this.context.drawImage(
                this.imgTexture,
                this.position.x, this.position.y,
                this.scale.x * this.imgTexture.width,
                this.scale.y * this.imgTexture.height);

            requestAnimationFrame(this.animate.bind(this));
        }


        gesturePinchZoom(event) {
            var zoom = false;

            if( event.targetTouches.length >= 2 ) {
                var p1 = event.targetTouches[0];
                var p2 = event.targetTouches[1];
                var zoomScale = Math.sqrt(Math.pow(p2.pageX - p1.pageX, 2) + Math.pow(p2.pageY - p1.pageY, 2)); //euclidian distance

                if( this.lastZoomScale ) {
                    zoom = zoomScale - this.lastZoomScale;
                }

                this.lastZoomScale = zoomScale;
            }

            return zoom;
        }

        doZoom(zoom) {
            if(!zoom) return;

            //new scale
            var currentScale = this.scale.x;
            var newScale = this.scale.x + zoom/100;


            //some helpers
            var deltaScale = newScale - currentScale;
            var currentWidth    = (this.imgTexture.width * this.scale.x);
            var currentHeight   = (this.imgTexture.height * this.scale.y);
            var deltaWidth  = this.imgTexture.width*deltaScale;
            var deltaHeight = this.imgTexture.height*deltaScale;


            //by default scale doesnt change position and only add/remove pixel to right and bottom
            //so we must move the image to the left to keep the image centered
            //ex: coefX and coefY = 0.5 when image is centered <=> move image to the left 0.5x pixels added to the right
            var canvasmiddleX = this.canvas.clientWidth / 2;
            var canvasmiddleY = this.canvas.clientHeight / 2;
            var xonmap = (-this.position.x) + canvasmiddleX;
            var yonmap = (-this.position.y) + canvasmiddleY;
            var coefX = -xonmap / (currentWidth);
            var coefY = -yonmap / (currentHeight);
            var newPosX = this.position.x + deltaWidth*coefX;
            var newPosY = this.position.y + deltaHeight*coefY;

            //edges cases
            var newWidth = currentWidth + deltaWidth;
            var newHeight = currentHeight + deltaHeight;

            if( newWidth < this.canvas.clientWidth ) return;
            if( newPosX > 0 ) { newPosX = 0; }
            if( newPosX + newWidth < this.canvas.clientWidth ) { newPosX = this.canvas.clientWidth - newWidth;}

            if( newHeight < this.canvas.clientHeight ) return;
            if( newPosY > 0 ) { newPosY = 0; }
            if( newPosY + newHeight < this.canvas.clientHeight ) { newPosY = this.canvas.clientHeight - newHeight; }


            //finally affectations
            this.scale.x    = newScale;
            this.scale.y    = newScale;
            this.position.x = newPosX;
            this.position.y = newPosY;
        }

        doMove(relativeX, relativeY) {
            if(this.lastX && this.lastY) {
                var deltaX = relativeX - this.lastX;
                var deltaY = relativeY - this.lastY;
                var currentWidth = (this.imgTexture.width * this.scale.x);
                var currentHeight = (this.imgTexture.height * this.scale.y);

                this.position.x += deltaX;
                this.position.y += deltaY;


                //edge cases
                if( this.position.x > 0 ) {
                this.position.x = 0;
                }
                else if( this.position.x + currentWidth < this.canvas.clientWidth ) {
                this.position.x = this.canvas.clientWidth - currentWidth;
                }
                if( this.position.y > 0 ) {
                this.position.y = 0;
                }
                else if( this.position.y + currentHeight < this.canvas.clientHeight ) {
                this.position.y = this.canvas.clientHeight - currentHeight;
                }
            }

            this.lastX = relativeX;
            this.lastY = relativeY;
        }

        setEventListeners() {
            // touch
            this.canvas.addEventListener('touchstart', function(e) {
                this.lastX          = null;
                this.lastY          = null;
                this.lastZoomScale  = null;
            }.bind(this));

            this.canvas.addEventListener('touchmove', function(e) {
                e.preventDefault();

                if(e.targetTouches.length == 2) { //pinch
                    this.doZoom(this.gesturePinchZoom(e));
                }
                else if(e.targetTouches.length == 1) {
                    var relativeX = e.targetTouches[0].pageX - this.canvas.getBoundingClientRect().left;
                    var relativeY = e.targetTouches[0].pageY - this.canvas.getBoundingClientRect().top;
                    this.doMove(relativeX, relativeY);
                }
            }.bind(this));

            if(this.desktop) {
                // keyboard+mouse
                window.addEventListener('keyup', function(e) {
                    if(e.keyCode == 187 || e.keyCode == 61) { //+
                        this.doZoom(5);
                    }
                    else if(e.keyCode == 54) {//-
                        this.doZoom(-5);
                    }
                }.bind(this));

                window.addEventListener('mousedown', function(e) {
                    this.mdown = true;
                    this.lastX = null;
                    this.lastY = null;
                }.bind(this));

                window.addEventListener('mouseup', function(e) {
                    this.mdown = false;
                }.bind(this));

                window.addEventListener('mousemove', function(e) {
                    var relativeX = e.pageX - this.canvas.getBoundingClientRect().left;
                    var relativeY = e.pageY - this.canvas.getBoundingClientRect().top;

                    if(e.target == this.canvas && this.mdown) {
                        this.doMove(relativeX, relativeY);
                    }

                    if(relativeX <= 0 || relativeX >= this.canvas.clientWidth || relativeY <= 0 || relativeY >= this.canvas.clientHeight) {
                        this.mdown = false;
                    }
                }.bind(this));
            }
        }

        checkRequestAnimationFrame() {
            var lastTime = 0;
            var vendors = ['ms', 'moz', 'webkit', 'o'];
            for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
                window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
                window.cancelAnimationFrame =
                    window[vendors[x]+'CancelAnimationFrame'] || window[vendors[x]+'CancelRequestAnimationFrame'];
            }

            if (!window.requestAnimationFrame) {
                window.requestAnimationFrame = function(callback, element) {
                    var currTime = new Date().getTime();
                    var timeToCall = Math.max(0, 16 - (currTime - lastTime));
                    var id = window.setTimeout(function() { callback(currTime + timeToCall); },
                        timeToCall);
                    lastTime = currTime + timeToCall;
                    return id;
                };
            }

            if (!window.cancelAnimationFrame) {
                window.cancelAnimationFrame = function(id) {
                    clearTimeout(id);
                };
            }
        }
    };

  /* touch event function ends*/

  this.image = function() {
    if(checkRemoved()) return;

    return canvas.toDataURL();
  }

  this.resize = function() {
    if(checkRemoved()) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  this.getViewport = function() {
    return view;
  }

  this.setViewport = function(v) {
    if(checkRemoved()) return;

    ccNetViz_utils.extend(view, v);

    checkChangeViewport();
  }

  this.resetView = () => this.setViewport({size:1,x:0,y:0});

  //expose these methods from layer into this class
  ['update'].forEach(function(method){
    (function(method, self){
      self[method] = function(){
        let args = arguments;
        for(let k in layers){
          let l = layers[k];
          l[method].apply(l,args);
        };
        return self;
      };
    })(method, self);
  });

  if(gl = getContext(canvas)){
    gl.clearColor(backgroundColor.r, backgroundColor.g, backgroundColor.b, backgroundColor.a);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);
  }

  view = {size:1,x:0,y:0};

  this.resize();

  textures = new ccNetViz_textures(events, onLoad);
  files = new ccNetViz_files(events, onLoad);
  texts = gl && (new ccNetViz_texts(gl, files, textures));
  layers.main = new ccNetViz_layer(canvas, context, view, gl, textures, files, texts, events, options, backgroundColor, nodeStyle, edgeStyle, getSize, getNodeSize, getLabelSize, getLabelHideSize, getNodesCnt, getEdgesCnt, onRedraw, onLoad);

  if(!gl)
    console.warn("Cannot initialize WebGL context");
};

ccNetViz.isWebGLSupported = () => !!getContext(sCanvas);


ccNetViz.color = ccNetViz_color;
ccNetViz.spatialSearch = ccNetViz_spatialSearch;
ccNetViz.layout = ccNetViz_layout;
ccNetViz.color = ccNetViz_color;


window.ccNetViz = ccNetViz;
export default ccNetViz;
