/*
Copyright 2010 OCAD University 

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://source.fluidproject.org/svn/LICENSE.txt
*/

var fluid_1_2 = fluid_1_2 || {};

(function ($, fluid) {

    fluid.uploader = fluid.uploader || {};
    
    fluid.uploader.html5Strategy = function (options) {
        var that = fluid.initLittleComponent("fluid.uploader.html5Strategy", options);
        fluid.initDependents(that);
        return that;
    };
    
    fluid.defaults("fluid.uploader.html5Strategy", {
        components: {
            local: {
                type: "fluid.uploader.html5Strategy.local"
            },
            
            remote: {
                type: "fluid.uploader.remote"
            }
        }
    });

    fluid.demands("fluid.uploader.html5Strategy", "fluid.multiFileUploader", {
        funcName: "fluid.uploader.html5Strategy",
        args: [
            fluid.COMPONENT_OPTIONS
        ]
    });
    
    fluid.demands("fluid.uploader.progressiveStrategy", "fluid.uploader.html5", {
        funcName: "fluid.uploader.html5Strategy",
        args: [
            fluid.COMPONENT_OPTIONS
        ]
    });
    
    
    // TODO: The following two or three functions probably ultimately belong on a that responsible for
    // coordinating with the XHR. A fileConnection object or something similar.
    
    fluid.uploader.html5Strategy.fileSuccessHandler = function (file, events) {
        events.onFileSuccess.fire(file);
        events.onFileComplete.fire(file);
    };
    
    fluid.uploader.html5Strategy.progressTracker = function () {
        var that = {
            previousBytesLoaded: 0
        };
        
        that.getChunkSize = function (bytesLoaded) {
            var chunkSize = bytesLoaded - that.previousBytesLoaded;
            that.previousBytesLoaded = bytesLoaded;
            return chunkSize;
        };
        
        return that;
    };
    
    var createFileUploadXHR = function (file, events) {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                fluid.uploader.html5Strategy.fileSuccessHandler(file, events);
            }
        };

        var progressTracker = fluid.uploader.html5Strategy.progressTracker();
        xhr.upload.onprogress = function (pe) {
            events.onFileProgress.fire(file, progressTracker.getChunkSize(pe.loaded), pe.total);
        };
        
        return xhr;
    };
    
    // Set additional POST parameters for xhr  
    var setPostParams =  function (formData, postParams) {
        $.each(postParams,  function (key, value) {
            formData.append(key, value);
        });
    };
    
    fluid.uploader.html5Strategy.remote = function (queue, queueSettings, events, options) {
        var that = fluid.initLittleComponent("fluid.uploader.html5Strategy.remote", options);
        that.queue = queue;
        that.queueSettings = queueSettings;
        that.events = events;
        
        // Upload files in the current batch without exceeding the fileUploadLimit
        // and the fileSizeLimit.  The fileSizeLimit is scaled to KBs.
        that.start = function () {
            var files = that.queue.currentBatch.files;
            var fileUploadLimit = that.queueSettings.fileUploadLimit;
            
            for (var i = 0; i < files.length; i++) {
                var file = files[i];
                if(fileUploadLimit === 0 ||
                        that.queue.currentBatch.numFilesCompleted < fileUploadLimit &&
                        file.size < (that.queueSettings.fileSizeLimit*1000)) {
                    that.uploadFile(file);
                }
            }
            that.events.afterUploadComplete.fire(files);
        };
        
        that.uploadFile = function (file) {
            that.events.onFileStart.fire(file);
            that.currentXHR = createFileUploadXHR(file, events);
            that.doUpload(file, that.queueSettings, that.currentXHR);            
        };

        that.stop = function () {
            file.filestatus = fluid.uploader.fileStatusConstants.CANCELLED;
            that.queue.shouldStop = true;
            that.currentXHR.abort();
            that.events.onUploadStop.fire();
        };
        
        fluid.initDependents(that);
        that.events.afterReady.fire();
        return that;
    };
    
    fluid.defaults("fluid.uploader.html5Strategy.remote", {
        invokers: {
            doUpload: "fluid.uploader.html5Strategy.doUpload"
        }
    });
    
    fluid.demands("fluid.uploader.remote", "fluid.uploader.html5Strategy", {
        funcName: "fluid.uploader.html5Strategy.remote",
        args: [
            "{multiFileUploader}.queue", 
            "{multiFileUploader}.options.queueSettings",
            "{multiFileUploader}.events",
            fluid.COMPONENT_OPTIONS
        ]
    });
    
    var CRLF = "\r\n";
    
    /** 
     * Firefox 4  implementation.  FF4 has implemented a FormData function which
     * conveniently provides easy construct of set key/value pairs representing 
     * form fields and their values.  The FormData is then easily sent using the 
     * XMLHttpRequest send() method.  
     */
    fluid.uploader.html5Strategy.doFormDataUpload = function (file, queueSettings, xhr) {
        var formData = new FormData();
        formData.append("file", file);
        
        setPostParams(formData, queueSettings.postParams);
        
        // set post params here.
        xhr.open("POST", queueSettings.uploadURL, true);
        xhr.send(formData);
    };
    
    var generateMultipartBoundary = function () {
        var boundary = '---------------------------';
        boundary += Math.floor(Math.random()*32768);
        boundary += Math.floor(Math.random()*32768);
        boundary += Math.floor(Math.random()*32768);
        return boundary;
    };
    
    /*
     * Create the multipart/form-data content by hand to send the file
     */
    fluid.uploader.html5Strategy.doManualMultipartUpload = function (file, queueSettings, xhr) {
        var boundary = generateMultipartBoundary();
        
        var multipart = " ";
        multipart += "--" + boundary + CRLF;
        multipart += "Content-Disposition: form-data;" +
                     " name=\"fileData\";" + 
                     " filename=\"" + file.name + 
                     "\"" + CRLF;
        multipart += "Content-Type: " + file.type + CRLF + CRLF;
        multipart += file.getAsBinary(); // TODO: Ack, concatting binary data to JS String!
        multipart += CRLF + "--" + boundary + "--" + CRLF;
        
        xhr.open("POST", queueSettings.uploadURL, true);
        xhr.setRequestHeader("Content-Type", "multipart/form-data; boundary=" + boundary);
        xhr.sendAsBinary(multipart);
    };
    
    // Default configuration for older browsers that don't support FormData
    fluid.demands("fluid.uploader.html5Strategy.doUpload", "fluid.uploader.html5Strategy.remote", {
        funcName: "fluid.uploader.html5Strategy.doManualMultipartUpload"
    });
    
    // Configuration for FF4, Chrome, and Safari 4+, all of which support FormData correctly.
    fluid.demands("fluid.uploader.html5Strategy.doUpload", [
        "fluid.uploader.html5Strategy.remote", 
        "fluid.browser.supportsFormData"
    ], {
        funcName: "fluid.uploader.html5Strategy.doFormDataUpload"
    });
    
    
    fluid.uploader.html5Strategy.local = function (events, queue, queueSettings, browseButton, options) {
        var that = fluid.initLittleComponent("fluid.uploader.html5Strategy.local", options);
        that.events = events;
        that.queue = queue;
        that.queueSettings = queueSettings;

        // Add files to the file queue without exceeding the fileQueueLimit 
        that.addFiles = function (files) {
            var filesToUpload = files.length;
            var fileQueueLimit = that.queueSettings.fileQueueLimit;
            var filesInQueue = that.queue.files.length - that.queue.getUploadedFiles().length;
            
            if(fileQueueLimit !== 0 && (filesToUpload + filesInQueue) > fileQueueLimit) { 
                filesToUpload = fileQueueLimit - filesInQueue;
            } 
            
            for (var i = 0; i < filesToUpload; i++) {
                var file = files[i];
                file.filestatus = fluid.uploader.fileStatusConstants.QUEUED;
                file.id = "file-" + fluid.allocateGuid();
                that.events.afterFileQueued.fire(file);
            }
            
            that.events.afterFileDialog.fire(files.length);    
        };
        
        that.removeFile = function (file) {
        };
        
        that.enableBrowseButton = function () {
            var activeMultiFileInput = getActiveMultiFileInput(browseButton);
            activeMultiFileInput.removeAttr("disabled");
        };
        
        that.disableBrowseButton = function () {
            var activeMultiFileInput = getActiveMultiFileInput(browseButton);
            activeMultiFileInput.attr("disabled", "disabled");
        };
        
        fluid.initDependents(that);
        return that;
    };
    
    
    fluid.defaults("fluid.uploader.html5Strategy.local", {
        components: {
            browseHandler: {
                type: "fluid.uploader.html5Strategy.browseHandler"
            }
        }
    });
    
    fluid.demands("fluid.uploader.html5Strategy.local", "fluid.uploader.html5Strategy", {
        funcName: "fluid.uploader.html5Strategy.local",
        args: [
            "{multiFileUploader}.events",
            "{multiFileUploader}.queue",
            "{multiFileUploader}.options.queueSettings",
            "{multiFileUploader}.dom.browseButton",
            fluid.COMPONENT_OPTIONS
        ]
    });
    
    /*
     * Return the active multi-file input from the input stack
     */
    var getActiveMultiFileInput = function (browseButton) {
        var inputs = browseButton.children();
        return inputs.eq(inputs.length - 1);
    };
    
    var bindEventsToFileInput = function (that, fileInput) {
        fileInput.click(function () {
            that.events.onFileDialog.fire();
        });
        
        fileInput.change(function () {
            var files = fileInput[0].files;
            that.addFilesFn.apply(null, [files]);
            that.renderFreshMultiFileInput();
        });
        
        fileInput.focus(function () {
            that.browseButton.addClass("focus");
        });
        
        fileInput.blur(function () {
            that.browseButton.removeClass("focus");
        });
    };
    
    var renderMultiFileInput = function (that) {
        var multiFileInput = $(that.options.multiFileInputMarkup);
        var fileTypes = (that.queueSettings.fileTypes).replace(/\;/g, ',');       
        multiFileInput.attr("accept", fileTypes);
        that.inputs.push(multiFileInput);
        bindEventsToFileInput(that, multiFileInput);
        return multiFileInput;
    };
    
    var setupBrowseHandler = function (that) {
        var multiFileInput = renderMultiFileInput(that);        
        that.browseButton.append(multiFileInput);
        that.browseButton.attr("tabindex", -1);
    };
    
    
    fluid.uploader.html5Strategy.browseHandler = function (events, queueSettings, browseButton, addFilesFn, options) {
        var that = fluid.initLittleComponent("fluid.uploader.html5Strategy.browseHandler", options);
        that.inputs = [];
        that.events = events;
        that.queueSettings = queueSettings;
        that.browseButton = browseButton;
        that.addFilesFn = addFilesFn;
        
        that.renderFreshMultiFileInput = function () {
            // Update the stack of multi file input elements we have in the DOM.
            var previousInput = that.inputs[that.inputs.length - 1];
            previousInput.hide();
            previousInput.attr("tabindex", -1);
            var newInput = renderMultiFileInput(that);
            previousInput.after(newInput);
        };
        
        setupBrowseHandler(that);
        return that;
    };
    
    fluid.defaults("fluid.uploader.html5Strategy.browseHandler", {
        multiFileInputMarkup: "<input type='file' multiple='' class='fl-hidden'/>"
    });
    
    fluid.demands("fluid.uploader.html5Strategy.browseHandler", "fluid.uploader.html5Strategy.local", {
        funcName: "fluid.uploader.html5Strategy.browseHandler",
        args: [
            "{multiFileUploader}.events",
            "{multiFileUploader}.options.queueSettings",
            "{multiFileUploader}.dom.browseButton",
            "{local}.addFiles"
        ]
    });

})(jQuery, fluid_1_2);    
