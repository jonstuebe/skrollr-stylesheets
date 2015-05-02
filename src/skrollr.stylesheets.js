/*!
 * skrollr stylesheets.
 * Parses stylesheets and searches for skrollr keyframe declarations.
 * Converts them to data-attributes.
 * Doesn't expose any globals.
 */
$(document).ready(function(window, document, undefined) {
// $(function(window, document, undefined) {
  'use strict';

  var content;
  var contents = [];

  //Finds the declaration of an animation block.
  var rxAnimation = /@-skrollr-keyframes\s+([\w-]+)/g;

  //Finds the block of keyframes inside an animation block.
  //http://regexpal.com/ saves your ass with stuff like this.
  var rxKeyframes = /\s*\{\s*((?:[^{]+\{[^}]*\}\s*)+?)\s*\}/g;

  //Gets a single keyframe and the properties inside.
  var rxSingleKeyframe = /([\w\-]+)\s*\{([^}]+)\}/g;

  //Optional keyframe name prefix to work around SASS (>3.4) issues
  var keyframeNameOptionalPrefix = 'skrollr-';

  //Finds usages of the animation.
  var rxAnimationUsage = /-skrollr-animation-name\s*:\s*([\w-]+)/g;

  //Finds usages of attribute setters.
  var rxAttributeSetter = /-skrollr-(anchor-target|smooth-scrolling|emit-events|menu-offset)\s*:\s*['"]([^'"]+)['"]/g;

  var applyKeyframeAttributesDone = false;
  var applyAttributeSettersDone = false;

  var fetchRemote = function(url) {
    var xhr = new XMLHttpRequest();

    /*
     * Yes, these are SYNCHRONOUS requests.
     * Simply because skrollr stylesheets should run while the page is loaded.
     * Get over it.
     */
    try {
      xhr.open('GET', url, false);
      xhr.send(null);
    } catch (e) {
      //Fallback to XDomainRequest if available
      if (window.XDomainRequest) {
        xhr = new XDomainRequest();
        xhr.open('GET', url, false);
        xhr.send(null);
      }
    }

    return xhr.responseText;
  };

  var numValidStyles = function(stylesheets) {

    var sheets = 0,
        valid = [];

    $.each(stylesheets, function(index, value)
    {

      var sheet = stylesheets[index];
      if(sheet.tagName === 'LINK'){

        if(sheet.getAttribute('data-skrollr-stylesheet') !== null) {
          
          //Test media attribute if matchMedia available.
          if(window.matchMedia) {
            var media = sheet.getAttribute('media');

            if(media && matchMedia(media).matches) {
              // continue;
              sheets++;
              valid.push(sheet);
            }
          }

        }

      }

    });

    return valid;

  }

  var cacheExpire = function(){



  }

  //"main"
  var kickstart = function(stylesheets) {
    //Iterate over all stylesheets, embedded and remote.
    var last = false,
        validStyles = numValidStyles(stylesheets);

    $.each(validStyles, function(index, val)
    {

      var sheet = this,
          _index = index + 1;

      var _href = sheet.href.split('/');
      _href = _href[_href.length - 1].replace('.css','');

      if(Modernizr.localstorage && localStorage.getItem('skrollr-cache-' + _href))
      {
        var data = localStorage.getItem('skrollr-cache-' + _href),
            expire = localStorage.getItem('skrollr-cacheExpire');

        if($.now() >= expire)
        {
          // console.log('refresh cache');
          ajaxSheet(sheet.href);
        }
        else
        {
          // console.log('from cache');
          if(data)
          {
            contents.push(data);
          }

          processContent(contents);
        }
      }
      else
      {
        // console.log('no cache');
        ajaxSheet(sheet.href);
      }

    });

    if(validStyles.length == 0)
    {
      checkComplete(true);
    }
    
  };

  var ajaxSheet = function(sheet, callback){
    
    var _href = sheet.split('/');
      _href = _href[_href.length - 1].replace('.css','');

    $.get(sheet, function(data){
      if(data) {

        if(Modernizr.localstorage)
        {
          localStorage.setItem('skrollr-cache-' + _href, data);
          localStorage.setItem('skrollr-cacheExpire', $.now() + (1000 * 3600));
        }

        contents.push(data);
      }

      processContent(contents);
      if(typeof callback == 'function')
      {
        callback();
      }
    });
  };

  var processContent = function(contents){
    //We take the stylesheets in reverse order.
    //This is needed to ensure correct order of stylesheets and inline styles.
    contents.reverse();

    var animations = {};
    var selectors = [];
    var attributes = [];

    //Now parse all stylesheets.
    for(var contentIndex = 0; contentIndex < contents.length; contentIndex++) {
      content = contents[contentIndex];

      parseAnimationDeclarations(content, animations);
      parseAnimationUsage(content, selectors);
      parseAttributeSetters(content, attributes);
    }

    applyKeyframeAttributes(animations, selectors, checkComplete);
    applyAttributeSetters(attributes, checkComplete);
  }

  var checkComplete = function(force){

    if(force == true)
    {
      $(window).trigger('skrollr-ready');
      $('html').addClass('skrollr-ready');
    }

    if(applyAttributeSettersDone == true && applyKeyframeAttributesDone == true)
    {
      $(window).trigger('skrollr-ready');
      $('html').addClass('skrollr-ready');
    }
    else
    {
      return false;
    }

  }

  //Finds animation declarations and puts them into the output map.
  var parseAnimationDeclarations = function(input, output) {
    rxAnimation.lastIndex = 0;

    var animation;
    var rawKeyframes;
    var keyframe;
    var curAnimation;

    while((animation = rxAnimation.exec(input)) !== null) {
      //Grab the keyframes inside this animation.
      rxKeyframes.lastIndex = rxAnimation.lastIndex;
      rawKeyframes = rxKeyframes.exec(input);

      //Grab the single keyframes with their CSS properties.
      rxSingleKeyframe.lastIndex = 0;

      //Save the animation in an object using it's name as key.
      curAnimation = output[animation[1]] = {};

      while((keyframe = rxSingleKeyframe.exec(rawKeyframes[1])) !== null) {
        //Put all keyframes inside the animation using the keyframe (like botttom-top, or 100) as key
        //and the properties as value (just the raw string, newline stripped).
        curAnimation[keyframe[1]] = keyframe[2].replace(/[\n\r\t]/g, '').replace(/ /g,'');
      }
    }
  };

  //Extracts the selector of the given block by walking backwards to the start of the block.
  var extractSelector = function(input, startIndex) {
    var begin;
    var end = startIndex;

    //First find the curly bracket that opens this block.
    while(end-- && input.charAt(end) !== '{') {}

    //The end is now fixed to the right of the selector.
    //Now start there to find the begin of the selector.
    begin = end;

    //Now walk farther backwards until we grabbed the whole selector.
    //This either ends at beginning of string or at end of next block.
    while(begin-- && input.charAt(begin - 1) !== '}') {}

    //Return the cleaned selector.
    return input.substring(begin, end).replace(/[\n\r\t]/g, '');
  };

  //Finds usage of animations and puts the selectors into the output array.
  var parseAnimationUsage = function(input, output) {
    var match;
    var selector;

    rxAnimationUsage.lastIndex = 0;

    while((match = rxAnimationUsage.exec(input)) !== null) {
      //Extract the selector of the block we found the animation in.
      selector = extractSelector(input, rxAnimationUsage.lastIndex);

      //Associate this selector with the animation name.
      output.push([selector, match[1]]);
    }
  };

  //Finds usage of attribute setters and puts the selector and attribute data into the output array.
  var parseAttributeSetters = function(input, output) {
    var match;
    var selector;

    rxAttributeSetter.lastIndex = 0;

    while((match = rxAttributeSetter.exec(input)) !== null) {
      //Extract the selector of the block we found the animation in.
      selector = extractSelector(input, rxAttributeSetter.lastIndex);

      //Associate this selector with the attribute name and value.
      output.push([selector, match[1], match[2]]);
    }
  };

  //Applies the keyframes (as data-attributes) to the elements.
  var applyKeyframeAttributes = function(animations, selectors, callback) {
    var elements;
    var keyframes;
    var keyframeName;
    var cleanKeyframeName;
    var elementIndex;
    var attributeName;
    var attributeValue;
    var curElement;
    var keyframeIndex;

    for(var selectorIndex = 0; selectorIndex < selectors.length; selectorIndex++) {
      elements = document.querySelectorAll(selectors[selectorIndex][0]);

      if(!elements) {
        continue;
      }

      keyframes = animations[selectors[selectorIndex][1]],
      keyframeIndex = 0;

      for(keyframeName in keyframes) {
        
        if(keyframeName.indexOf(keyframeNameOptionalPrefix) === 0) {
          cleanKeyframeName = keyframeName.substring(keyframeNameOptionalPrefix.length);
        } else {
          cleanKeyframeName = keyframeName;
        }

        for(elementIndex = 0; elementIndex < elements.length; elementIndex++) {
          curElement = elements[elementIndex];
          attributeName = 'data-' + cleanKeyframeName;
          curElement.removeAttribute(attributeName);
          attributeValue = keyframes[keyframeName];

          //If the element already has this keyframe inline, give the inline one precedence by putting it on the right side.
          //The inline one may actually be the result of the keyframes from another stylesheet.
          //Since we reversed the order of the stylesheets, everything comes together correctly here.
          if(curElement.hasAttribute(attributeName)) {
            attributeValue += curElement.getAttribute(attributeName);
          }

          curElement.setAttribute(attributeName, attributeValue);
        }

        if((keyframeIndex + 1) == countProperties(keyframes) && (selectorIndex + 1) == selectors.length)
        {
          applyKeyframeAttributesDone = true;
          callback();
        }

        keyframeIndex++;

      }
    }
  };

  var countProperties = function(obj){
    var count = 0;
    for(var prop in obj) {
      if(obj.hasOwnProperty(prop))
      {
        count++;
      }
    }
    return count;
  }

  //Applies the keyframes (as data-attributes) to the elements.
  var applyAttributeSetters = function(selectors, callback) {
    var curSelector;
    var elements;
    var attributeName;
    var attributeValue;
    var elementIndex;

    if(!selectors.length)
    {
      applyAttributeSettersDone = true;
      callback();
    }

    for(var selectorIndex = 0; selectorIndex < selectors.length; selectorIndex++) {
      curSelector = selectors[selectorIndex];
      elements = document.querySelectorAll(curSelector[0]);
      attributeName = 'data-' + curSelector[1];
      attributeValue = curSelector[2];

      if(!elements) {
        continue;
      }

      for(elementIndex = 0; elementIndex < elements.length; elementIndex++) {
        elements[elementIndex].setAttribute(attributeName, attributeValue);

        if((elementIndex + 1) == elements.length && (selectorIndex + 1) == selectors.length)
        {
          applyAttributeSettersDone = true;
          callback();
        }
      }
    }
  };

  $(window).on('load', function(){
    kickstart(document.querySelectorAll('link, style'))
  });

}(window, document));