/*globals Uint8Array, console, angular, bson, app, document, Float32Array*/

// Main module
angular.module('IOLabApp', ['ui.bootstrap', 'ngSanitize']);

angular.module('IOLabApp').run(function ($rootScope, $window, IOLab) {
    'use strict';

    angular.element($window).on('resize', function () {
        $rootScope.$broadcast('global:resize');
    });

    // Expose the IOLabServiceObjectForCppObjectApp object to the global scope!
    // This function is called from the CEF Application depending on signals
    // sent by the API
    $window.IOLabServiceObjectForCppObjectApp = {
        executeMethod: function (args) {
            var execArgs = args || {};
            IOLab.execute(execArgs.method, execArgs.args);
        }
    };

    IOLab.getAcquisitionStack();
    IOLab.getHardwareState();
});

// Some constants
angular.module('IOLabApp').constant('acquisitionManagementCmd', {
    GetList: 0,
    Reload: 1,
    Delete: 2
});

// The "app" listener is accessible within the CEF application.
// It is used to communicate with the CEF client.
angular.module('IOLabApp').factory('IOLabAPI', function (BSON) {
    'use strict';

    var exports = {};

    var _app = app || {};

    /*
    * Helper method to build the buffer array...
    */
    function dezerialize(bson, dataBuffer) {

        var len, i, n,
            bufferInit8,
            bufferFloat32,
            t1 = new Date();

        if (!bson) {
            return;
        }

        // Deserialize the bson
        len = bson.length;
        bufferInit8 = new Uint8Array(len);
        for (i = 0; i < len; i++) {
            bufferInit8[i] = bson.charCodeAt(i);
        }
        var json = BSON.deserialize(bufferInit8);

        // Deserialize the data buffer
        if (dataBuffer && json.datalength && !!json.sampleSize) {

            // Deserialize the string into Uint8Array
            len = dataBuffer.length;
            bufferInit8 = new Uint8Array(len);
            for (i = 0; i < len; i++) {
                bufferInit8[i] = dataBuffer.charCodeAt(i);
            }

            // Create a view on the float array
            bufferFloat32 = new Float32Array(bufferInit8.buffer);

            // Build the data array with the data
            // For parametric plot, only 1 vector with elements [t, s1a, s1b, s1c, s2, ...]
            // For charts, one vector with elements [t, cal_x, (raw_x)] for each sensor path
            json.data = [];

            // Param plot
            if (json.sampleSize instanceof Array) {

                for (i = 0; i < json.datalength; i++) {
                    var data = [];
                    for (n = 0; n < json.sampleSize[0] + json.sampleSize[1] + 1; n++) {
                        data.push(bufferFloat32[n * json.datalength + i]);
                    }
                    json.data.push(data);
                }

            } else {
            // Chart

                // Initialisation fo the vector of vector
                for (n = 0; n < json.sampleSize; n++) {
                    json.data[n] = [];
                }

                for (i = 0; i < json.datalength; i++) {
                    for (n = 0; n < json.sampleSize; n++) {
                        if (!json.rawdata) {
                            json.data[n].push([
                                bufferFloat32[i],
                                bufferFloat32[(n + 1) * json.datalength + i]
                            ]);
                        } else {
                            json.data[n].push([
                                bufferFloat32[i],
                                bufferFloat32[(n + 1) * json.datalength + i],
                                bufferFloat32[(n + 1 + json.sampleSize) * json.datalength + i]
                            ]);
                        }
                    }
                }
            }
        }

        var t2 = new Date(),
            delta_t = t2 - t1,
            size_kb = parseInt(((bufferFloat32 || []).length / 256).toFixed(0), 10);
        if (delta_t > 10 && bufferFloat32)
            console.log('*** Data deserialization:', delta_t, 'ms -', size_kb, 'kB');
        return json;
    }

    function cefRegister(message) {
        return function () {
            var args = [].slice.call(arguments);

            _app.sendMessage(message, args);
        };
    }

    function cefRegisterCallback(message) {
        var count = 0;
        return function () {
            var msg = message + (count++),
                args = [].slice.call(arguments),
                callback = args.shift();

            _app.setMessageCallback(msg, function (msg, result, result2) {
                _app.removeMessageCallback(msg);
                callback(dezerialize(result, result2));
                count %= 100;
            });

            _app.sendMessage(msg, args);
        };
    }

    console.log('Chromium Embedded Framework');

    // Args: remote
    exports.remotePowerOff = cefRegister('iolab_remotePowerOff');

    // args: cmd
    exports.sendCommand = cefRegister('iolab_sendCommand');

    // args: remote, status
    exports.pairRemote = cefRegister('iolab_pairRemote');

    // args: remote, config, force
    exports.setFixedConfig = cefRegister('iolab_setFixedConfig');

    // args: remote, sensor, key, value
    exports.setOutputConfig = cefRegister('iolab_setOutputConfig');

    // args: remote, type
    exports.resetSensorOffset = cefRegister('iolab_resetSensorOffset');

    // args: remote, type, fileName
    exports.exportData = cefRegister('iolab_exportData');

    // args: null
    exports.startDataAcquisition = cefRegister('iolab_startData');

    // args: null
    exports.stopDataAcquisition = cefRegister('iolab_stopData');

    // args: callback
    exports.getHardwareState = cefRegisterCallback('iolab_getHardwareState');

    // args: callback
    exports.getAcquisitionStack = cefRegisterCallback('iolab_getAcquisitionStack');

    // args: callback, param1, param2, ...
    exports.getSensorData = cefRegisterCallback('iolab_getSensorData1');

    // args: callback, param1, param2, ...
    exports.getSensorData2 = cefRegisterCallback('iolab_getSensorData2');

    // args: null
    exports.stackAcquisition = cefRegister('iolab_stackAcquisition');

    // args: null
    exports.deleteAcquisition = cefRegisterCallback('iolab_deleteAcquisition');

    /*
     *  Acquisition management (list, reload, delete)
     */

    // args: callback, cmd, acqId
    exports.acquisitionManagement = cefRegisterCallback('iolab_acquisitionManagement');

    /*
     * Bson management
     */

    // args: collection, bsrec
    exports.saveBson = cefRegister('iolab_saveBson');

    // args: collection, bsrec
    exports.removeBson = cefRegister('iolab_removeBson');

    // executeQuery - args: callback, collection, qrec
    exports.executeQuery = cefRegisterCallback('iolab_executeQuery');

    return exports;
});
