/*
Copyright 2007 - 2008 University of Toronto
Copyright 2007 University of Cambridge

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://source.fluidproject.org/svn/LICENSE.txt
*/

// Declare dependencies.
/*global jQuery*/
/*global fluid*/

var fluid = fluid || {};

(function (jQuery, fluid) {
    
    fluid.orientation = {
        HORIZONTAL: 4,
        VERTICAL: 1,
        UNORIENTED: 5
    };
    
    fluid.rectSides = {
      // agree with fluid.orientation
      4: ["left", "right"],
      1: ["top", "bottom"],
      // agree with fluid.direction
      8: "top",
      12: "bottom",
      2: "left",
      3: "right"
      };
    
    /**
     * This is the position, relative to a given drop target, that a dragged item should be dropped.
     */
    fluid.position = {
        BEFORE: -1,
        INTERLEAVED: 0,
        AFTER: 1,
        INSIDE: 2,
        REPLACE: 3
    };
    
    /**
     * For incrementing/decrementing a count or index, or moving in a rectilinear direction.
     */
    fluid.direction = {
        NEXT: 1,
        PREVIOUS: -1,
        UP: 8,
        DOWN: 12,
        LEFT: 2,
        RIGHT: 3
    };
    
    fluid.directionSign = function(direction) {
        return direction === fluid.direction.UP || direction === fluid.direction.LEFT? 
             fluid.direction.PREVIOUS : fluid.direction.NEXT;
    };
    
    fluid.directionAxis = function(direction) {
        return direction === fluid.direction.LEFT || direction === fluid.direction.RIGHT?
            0 : 1; 
    };
    
    fluid.directionOrientation = function(direction) {
        return fluid.directionAxis(direction)? fluid.orientation.VERTICAL : fluid.orientation.HORIZONTAL;
    };
    
    fluid.keycodeDirection = {
        up: fluid.direction.UP,
        down: fluid.direction.DOWN,
        left: fluid.direction.LEFT,
        right: fluid.direction.RIGHT
    };
    
    // moves a single node in the DOM to a new position relative to another
    fluid.moveDom = function(source, target, position) {
        source = fluid.unwrap(source);
        target = fluid.unwrap(target);
        
        var scan;
        // fluid.log("moveDom source " + fluid.dumpEl(source) + " target " + fluid.dumpEl(target) + " position " + position);     
        if (position === fluid.position.INSIDE) {
            target.appendChild(source);
        }
        else if (position === fluid.position.BEFORE) {
           for (scan = target.previousSibling; ; scan = scan.previousSibling) {
               if (!scan || !fluid.isIgnorableNode(scan)) {
                   if (scan !== source) {
                       fluid.cleanseScripts(source);
                       target.parentNode.insertBefore(source, target);    
                   }
               break;
               }
           }
        }
        else if (position === fluid.position.AFTER) {
            for (scan = target.nextSibling; ; scan = scan.nextSibling) {
                if (!scan || !fluid.isIgnorableNode(scan)) {
                    if (scan !== source) {
                        fluid.cleanseScripts(source);
                        fluid.insertAfter(source, target);
                    }
                    break;
                }
            }
        }
        else {
          fluid.fail("Unrecognised position supplied to fluid.moveDom: " + position);
        }
    };
    
    fluid.normalisePosition = function(position, samespan, targeti, sourcei) {
        // convert a REPLACE into a primitive BEFORE/AFTER
        if (position === fluid.position.REPLACE) {
            position = samespan && targeti >= sourcei? fluid.position.AFTER: fluid.position.BEFORE;
        }
        return position;
    };
    
    fluid.permuteDom = function (element, target, position, sourceelements, targetelements) {
        element = fluid.unwrap(element);
        target = fluid.unwrap(target);
        var sourcei = jQuery.inArray(element, sourceelements);
        if (sourcei === -1) {
            fluid.fail("Error in permuteDom: source element " + fluid.dumpEl(element) 
               + " not found in source list " + fluid.dumpEl(sourceelements));
        }
        var targeti = jQuery.inArray(target, targetelements);
        if (targeti === -1) {
            fluid.fail("Error in permuteDom: target element " + fluid.dumpEl(target) 
               + " not found in source list " + fluid.dumpEl(targetelements));
        }
        var samespan = sourceelements === targetelements;
        position = fluid.normalisePosition(position, samespan, targeti, sourcei);

        //fluid.log("permuteDom sourcei " + sourcei + " targeti " + targeti);
        // cache the old neighbourhood of the element for the final move
        var oldn = {};
        oldn[fluid.position.AFTER] = element.nextSibling;
        oldn[fluid.position.BEFORE] = element.previousSibling;
        fluid.moveDom(sourceelements[sourcei], targetelements[targeti], position);
        
        // perform the leftward-moving, AFTER shift
        var frontlimit = samespan? targeti - 1: sourceelements.length - 2;
        var i;
        if (!samespan || targeti > sourcei) {
            for (i = frontlimit; i > sourcei; -- i) {
                fluid.moveDom(sourceelements[i + 1], sourceelements[i], fluid.position.AFTER);
            }
            if (sourcei + 1 < sourceelements.length) {
                fluid.moveDom(sourceelements[sourcei + 1], oldn[fluid.position.AFTER], fluid.position.BEFORE);
            }
        }
        // perform the rightward-moving, BEFORE shift
        var backlimit = samespan? sourcei - 1: targetelements.length - 1;
        if (position === fluid.position.AFTER) { 
           // we cannot do skip processing if the element was "fused against the grain" 
           targeti++;
        }
        if (!samespan || targeti < sourcei) {
            for (i = targeti; i < backlimit; ++ i) {
                fluid.moveDom(targetelements[i], targetelements[i + 1], fluid.position.BEFORE);
            }
            if (backlimit >=0 && backlimit < targetelements.length - 1) {
                fluid.moveDom(targetelements[backlimit], oldn[fluid.position.BEFORE], fluid.position.AFTER);
            }                
        }

    };
  
    var curCss = function(a, name) {
        return window.getComputedStyle? window.getComputedStyle(a, null).getPropertyValue(name) : 
          a.currentStyle[name];
    };
    
    var fastHidden = function(a) {
    	  return "hidden"==a.type || curCss(a,"display") === "none" || 
    	    curCss(a,"visibility") === "hidden";
    	    };
    

    var computeGeometry = function(element, orientation, disposition) {
        var elem = {};
        elem.element = element;
        elem.orientation = orientation;
        if (disposition === fluid.position.INSIDE) {
            elem.position = disposition;
        }
        var el = fluid.unwrap(element);
        // These measurements taken from ui.droppable.js
        elem.visible = element.is(":visible");
        if (fastHidden(el)) {
            elem.clazz = "hidden";
        }
        var pos = fluid.utils.computeAbsolutePosition(el) || [0, 0];
        var width = el.offsetWidth;
        var height = el.offsetHeight;
        elem.rect = {left: pos[0], top: pos[1]};
        elem.rect.right = pos[0] + width;
        elem.rect.bottom = pos[1] + height;
        return elem;
    };
    
    // A "suitable large" value for the sentinel blocks at the ends of spans
    var SENTINEL_DIMENSION = 10000;


    function dumpelem(cacheelem) {
      return "Rect top: " + cacheelem.rect.top +
                 " left: " + cacheelem.rect.left + 
               " bottom: " + cacheelem.rect.bottom +
                " right: " + cacheelem.rect.right + " for " + fluid.dumpEl(cacheelem.element);
    }
    
    fluid.dropManager = function () {
        var targets = [];
        var cache = {};
        var that = {};
        
        var lastClosest;
        
        function cacheKey(element) {
            return jQuery(element).data("");
        }
        
        function sentinelizeElement(targets, sides, cacheelem, fc, disposition) {
            var elemCopy = jQuery.extend(true, {}, cacheelem);
            elemCopy.rect[sides[fc]] = elemCopy.rect[sides[1 - fc]] + (fc? 1: -1);
            elemCopy.rect[sides[1 - fc]] = (fc? -1 : 1) * SENTINEL_DIMENSION;
            elemCopy.position = disposition === fluid.position.INSIDE?
               disposition : (fc? fluid.position.BEFORE : fluid.position.AFTER);
            if (fc === 0) {
               // HACK for now to ensure that a column with only locked portlets can be entered 
               elemCopy.clazz = null; 
            }
            targets[targets.length] = elemCopy;
        }
        
        var lastGeometry;
        
        that.updateGeometry = function(geometricInfo) {
            lastGeometry = geometricInfo;
            targets = [];
            cache = {};
            for (var i = 0; i < geometricInfo.length; ++ i) {
                var thisInfo = geometricInfo[i];
                var orientation = thisInfo.orientation;
                var disposition = thisInfo.disposition;
                if (disposition === fluid.position.INSIDE && thisInfo.elements.length !== 1) {
                    fluid.fail("Expanse at index " + i 
                    + " has been requested for INSIDE disposition, but does not have length 1");
                }
                var sides = fluid.rectSides[orientation];
                for (var j = 0; j < thisInfo.elements.length; ++ j) {
                    var element = jQuery(thisInfo.elements[j]);
                    var cacheelem = computeGeometry(element, orientation, disposition);
                    cacheelem.owner = thisInfo;
                    if (cacheelem.clazz !== "hidden" && geometricInfo.elementMapper) {
                        cacheelem.clazz = geometricInfo.elementMapper(thisInfo.elements[j]);
                    }
                    targets[targets.length] = cacheelem;
                    cache[element.data("")] = cacheelem;
                    // deal with sentinel blocks by creating near-copies of the end elements
                    if (j === 0) {
                        sentinelizeElement(targets, sides, cacheelem, 1, disposition);
                    }
                    if (j === thisInfo.elements.length - 1) {
                        sentinelizeElement(targets, sides, cacheelem, 0, disposition);
                    }
                    // fluid.log(dumpelem(cacheelem));
                }
            }   
        };
        
        that.startDrag = function() {
            that.updateGeometry(lastGeometry);
            lastClosest = null;
            jQuery("").bind("mousemove.fluid-dropManager", that.mouseMove);
        };
        
        that.lastPosition = function() {
            return lastClosest;
        };
        
        that.endDrag = function() {
            jQuery("").unbind("mousemove.fluid-dropManager");
        };
        
        that.mouseMove = function(evt) {
            var x = evt.pageX;
            var y = evt.pageY;
            //fluid.log("Mouse x " + x + " y " + y );
            
            var closestTarget = that.closestTarget(x, y, lastClosest);
            if (closestTarget && closestTarget !== fluid.dropManager.NO_CHANGE) {
               lastClosest = closestTarget;
              
               that.dropChangeFirer.fireEvent(closestTarget);
            }
        };
        
        that.dropChangeFirer = fluid.event.getEventFirer();
        
        var blankHolder = {
            element: null
        };
        
        that.closestTarget = function (x, y, lastClosest) {
            var mindistance = Number.MAX_VALUE;
            var minelem = blankHolder;
            var minlockeddistance = Number.MAX_VALUE;
            var minlockedelem = blankHolder;
            for (var i = 0; i < targets.length; ++ i) {
                var cacheelem = targets[i];
                if (cacheelem.clazz === "hidden") {
                    continue;
                    }
                var distance = fluid.geom.minPointRectangle(x, y, cacheelem.rect);
                if (cacheelem.clazz === "locked") {
                    if (distance < minlockeddistance) {
                        minlockeddistance = distance;
                        minlockedelem = cacheelem;
                    }
                }
                else {
                    if (distance < mindistance) {
                        mindistance = distance;
                        minelem = cacheelem;
                    }
                    if (distance === 0) {
                        break;
                    }
                }
            }
            if (!minelem) {
                return minelem;
            }
            
            var position = minelem.position;
            if (!position) {
                if (minelem.orientation === fluid.orientation.HORIZONTAL) {
                    position = x < (minelem.rect.left + minelem.rect.right) / 2?
                        fluid.position.BEFORE : fluid.position.AFTER;
                }
                else if (minelem.orientation === fluid.orientation.VERTICAL) {
                    position = y < (minelem.rect.top + minelem.rect.bottom) / 2?
                        fluid.position.BEFORE : fluid.position.AFTER;
                }
            }
            if (minlockeddistance >= mindistance) {
                minlockedelem = blankHolder;
            }
//            fluid.log("PRE: mindistance " + mindistance + " element " + 
//                fluid.dumpEl(minelem.element) + " minlockeddistance " + minlockeddistance
//                + fluid.dumpEl(minlockedelem.element));
            if (lastClosest && lastClosest.position === position &&
                fluid.unwrap(lastClosest.element) === fluid.unwrap(minelem.element) &&
                fluid.unwrap(lastClosest.lockedelem) === fluid.unwrap(minlockedelem.element)
                ) {
                return fluid.dropManager.NO_CHANGE;
            }
            //fluid.log("mindistance " + mindistance + " minlockeddistance " + minlockeddistance);
            return {
                position: position,
                element: minelem.element,
                lockedelem: minlockedelem.element
            };
        };
        
        that.projectFrom = function(element, direction) {
            that.updateGeometry(lastGeometry);
            var cacheelem = cache[cacheKey(element)];
            var projected = fluid.geom.projectFrom(cacheelem.rect, direction, targets);
            var retpos = projected.cacheelem.position;
            return {element: projected.cacheelem.element[0], 
                     position: retpos? retpos : fluid.position.BEFORE 
                     //(projected.wrapped? fluid.position.AFTER : fluid.position.BEFORE)
                     };
        };
        
        that.getOwningSpan = function(element) {
            return cache[cacheKey(element)].owner.elements;
        };
        
        that.geometricMove = function(element, target, position) {
           var sourceElements = that.getOwningSpan(element);
           var targetElements = that.getOwningSpan(target);
           fluid.permuteDom(element, target, position, sourceElements, targetElements);
        };
        
        return that;
    };
 
    fluid.dropManager.NO_CHANGE = "no change";


    fluid.geom = fluid.geom || {};
    
    // These distance algorithms have been taken from
    // http://www.cs.mcgill.ca/~cs644/Godfried/2005/Fall/fzamal/concepts.htm
    
    /** Returns the minimum squared distance between a point and a rectangle **/
    fluid.geom.minPointRectangle = function (x, y, rectangle) {
        var dx = x < rectangle.left? (rectangle.left - x) : 
                  (x > rectangle.right? (x - rectangle.right) : 0);
        var dy = y < rectangle.top? (rectangle.top - y) : 
                  (y > rectangle.bottom? (y - rectangle.bottom) : 0);
        return dx * dx + dy * dy;
    };
    
    /** Returns the minimum squared distance between two rectangles **/
    fluid.geom.minRectRect = function (rect1, rect2) {
        var dx = rect1.right < rect2.left? rect2.left - rect1.right : 
                 rect2.right < rect1.left? rect1.left - rect2.right :0;
        var dy = rect1.bottom < rect2.top? rect2.top - rect1.bottom : 
                 rect2.bottom < rect1.top? rect1.top - rect2.bottom :0;
        return dx * dx + dy * dy;
    };
    
    var makePenCollect = function () {
        return {
            mindist: Number.MAX_VALUE,
            minrdist: Number.MAX_VALUE
        };
    };

    /** Determine the one amongst a set of rectangle targets which is the "best fit"
     * for an axial motion from a "base rectangle" (commonly arising from the case
     * of cursor key navigation).
     * @param {Rectangle} baserect The base rectangl from which the motion is to be referred
     * @param {fluid.direction} direction  The direction of motion
     * @param {Array of Rectangle holders} targets An array of objects "cache elements" 
     * for which the member <code>rect</code> is the holder of the rectangle to be tested.
     * @return The cache element which is the most appropriate for the requested motion.
     */
    fluid.geom.projectFrom = function (baserect, direction, targets) {
        var axis = fluid.directionAxis(direction);
        var frontSide = fluid.rectSides[direction];
        var backSide = fluid.rectSides[axis * 15 + 5 - direction];
        var dirSign = fluid.directionSign(direction);
        
        var penrect = {left: (5*baserect.left + 3*baserect.right)/8,
                       right: (3*baserect.left + 5*baserect.right)/8,
                       top: (5*baserect.top + 3*baserect.bottom)/8,
                       bottom: (3*baserect.top + 5*baserect.bottom)/8};
        penrect[frontSide] = dirSign * SENTINEL_DIMENSION;
        penrect[backSide] = -penrect[frontSide];
        
        function accPen(collect, cacheelem, backSign) {
            var thisrect = cacheelem.rect;
            var pdist = fluid.geom.minRectRect(penrect, thisrect);
            var rdist = -dirSign * backSign * (baserect[backSign === 1? frontSide:backSide] 
                                             - thisrect[backSign === 1? backSide:frontSide]);
            // the oddity in the rdist comparison is intended to express "half-open"-ness of rectangles
            if (pdist <= collect.mindist && rdist >= (backSign === 1? 0 : 1)) {
                if (pdist == collect.mindist && rdist * backSign > collect.minrdist) {
                    return;
                }
                collect.minrdist = rdist*backSign;
                collect.mindist = pdist;
                collect.minelem = cacheelem;
            }
        }
        var collect = makePenCollect();
        var backcollect = makePenCollect();
        var lockedcollect = makePenCollect();

        for (var i = 0; i < targets.length; ++ i) {
            var elem = targets[i];
            if (elem.clazz === "hidden") {
                continue;
            }
            else if (elem.clazz === "locked") {
                accPen(lockedcollect, elem, 1);
            }
            else {
                accPen(collect, elem, 1);
                accPen(backcollect, elem, -1);
            }
//            fluid.log("Element " + i + " " + dumpelem(elem) + " mindist " + collect.mindist);
        }
        var togo = {
            wrapped: !collect.minelem,
            cacheelem: collect.minelem? collect.minelem : backcollect.minelem
        };
        if (lockedcollect.mindist < collect.mindist) {
            togo.lockedelem = lockedcollect.minelem;
        }
        return togo;
    };
}) (jQuery, fluid);
