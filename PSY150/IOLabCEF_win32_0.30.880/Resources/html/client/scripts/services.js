/*globals console, angular, d3, dispatch, FFT, bson*/

angular.module('IOLabApp').factory('IOLab', function ($rootScope, $q, BSON, IOLabAPI) {
    'use strict';

    /*
     * Private Members
     */

    var hardwareState = {
        remote1: { rfStatus: 0, configured: false, fixedConfig: 0, outputConfig: [] },
        remote2: { rfStatus: 0, configured: false, fixedConfig: 0, outputConfig: [] }
    };
    var acquisitionStack = { 'default': {
        remote1: { sensors: [] },
        remote2: { sensors: [] }
    }};

    var exports = {},
        apply = function (fct) {
            return $rootScope.$$phase ? fct() : $rootScope.$apply(function () { fct(); });
        };

    // Treatment of C++ signals
    exports.execute = function (method, args) {
        switch (method) {

        case 'hardwareStateChanged':
            exports.getHardwareState();
            break;

        case 'acquisitionStackChanged':
            exports.getAcquisitionStack();
            break;

        case 'dataStarted':
            apply(function () { $rootScope.$broadcast('dataStarted', ''); });
            break;

        case 'dataStopped':
            apply(function () { $rootScope.$broadcast('dataStopped', ''); });
            break;

        case 'fixedConfigChanged':
            apply(function () { $rootScope.$broadcast('fixedConfigChanged', args); });
            break;
        }
    };

    /*
     * Public methods
     */

    // Return true when the acquisition is set and has no data!
    exports.isNewAcquisition = function () {
        return acquisitionStack['default'].lastStartDate == 'not-a-date-time';
    };

    exports.hardwareState = function () { return hardwareState; };

    exports.acquisitionStack = function () { return acquisitionStack['default']; };

    exports.remotesState = function () {
        return {
            r1Off: hardwareState.remote1.rfStatus === 0,
            r2Off: hardwareState.remote2.rfStatus === 0
        };
    };

    // return the value of the output config for the specified remote, sensor and key
    exports.outputConfigValue = function (remote, sensor, key) {
        var sensorOutputConfig = _.find(hardwareState['remote' + remote].outputConfig, { sensor: sensor });
        if (!sensorOutputConfig) return -1;
        var keyValue = _.find(sensorOutputConfig.keyValues, { key: key });
        if (!keyValue || keyValue.value === undefined) return -1;
        return keyValue.value;
    };

    exports.sendCommand = function (cmd) {
        IOLabAPI.sendCommand(cmd);
    };

    exports.powerOff = function (remote) {
        IOLabAPI.remotePowerOff(remote);
    };

    exports.getHardwareState = function () {
        var deferred = $q.defer();
        IOLabAPI.getHardwareState(function (json) {
            hardwareState = json;
            apply(function () {
                $rootScope.$broadcast('hardwareStateChanged', '');
            });
            deferred.resolve(json);
        });
        return deferred.promise;
    };

    exports.getAcquisitionStack = function () {
        var deferred = $q.defer();
        IOLabAPI.getAcquisitionStack(function (json) {
            acquisitionStack = json;
            apply(function () {
                $rootScope.$broadcast('acquisitionStackChanged', '');
            });
            deferred.resolve(json);
        });
        return deferred.promise;
    };

    exports.pairRemote = function (remote, status) {
        IOLabAPI.pairRemote(remote, status);
    };

    exports.setFixedConfig = function (remote, config, force) {
        IOLabAPI.setFixedConfig(remote, config, force || false);
    };

    exports.setOutputConfig = function (remote, sensor, key, value) {
        IOLabAPI.setOutputConfig(remote, sensor, key, value);
    };

    exports.startData = function () {
        IOLabAPI.startDataAcquisition();
    };

    exports.stopData = function () {
        IOLabAPI.stopDataAcquisition();
    };

    exports.saveCalibration = function (json) {
        var bsrec = BSON.serialize2(json);
        IOLabAPI.saveBson('Calibration', bsrec);
    };

    exports.saveBson = function (collection, json) {
        var bsrec = BSON.serialize2(json);
        IOLabAPI.saveBson(collection, bsrec);
    };

    exports.executeQuery = function (callback, collection, json) {
        var bsrec = BSON.serialize2(json);
        IOLabAPI.executeQuery(callback, collection, bsrec);
    };

    exports.resetSensorOffset = function (remote, sensor) {
        return IOLabAPI.resetSensorOffset(remote, sensor);
    };

    exports.exportData = function (remote, sensor, fileName) {
        return IOLabAPI.exportData(remote, sensor, fileName || '');
    };

    exports.getSensorData = function (callback, args) {
        return IOLabAPI.getSensorData(
            callback,
            args.remote,
            args.sensor,
            args.startTime || 0,
            args.endTime || -1,
            args.raw || false,
            args.coord === undefined ? -1 : args.coord
        );
    };

    exports.getSensorData2 = function (callback, args) {
        return IOLabAPI.getSensorData2(
            callback,
            args.remote,
            args.sensor1,
            args.sensor2,
            args.startTime || 0,
            args.endTime || -1
        );
    };

    /*
     * Acquisition management
     */

    exports.acquisitionManagement = function (callback, cmd, acqID) {
        return IOLabAPI.acquisitionManagement(callback, cmd, acqID);
    };

    /*
     * AcquisitionStack management
     */

    exports.stackAcquisition = function () {
        return IOLabAPI.stackAcquisition();
    };

    exports.deleteAcquisition = function () {
        var deferred = $q.defer();
        IOLabAPI.deleteAcquisition(function(res) { deferred.resolve(res); });
        return deferred.promise;
    };

    return exports;
});

angular.module('IOLabApp').factory('gaugeService', function () {
    'use strict';

    var gauge = function (placeholderName, configuration) {

        var exports = {},
            config = {},
            body;

        function configure(configuration) {
            config = configuration;

            config.size = config.size * 0.9;

            config.raduis = config.size * 0.97 / 2;
            config.cx = config.size / 2;
            config.cy = config.size / 2;

            config.min = undefined !== configuration.min ? configuration.min : -20;
            config.max = undefined !== configuration.max ? configuration.max :  20;
            config.range = config.max - config.min;

            config.majorTicks = configuration.majorTicks || 5;
            config.minorTicks = configuration.minorTicks || 2;

            config.transitionDuration = configuration.transitionDuration || 250;
        }

        function valueToDegrees(value) {
            return value / config.range * 270 - (config.min / config.range * 270 + 45);
        }

        function valueToRadians(value) {
            return valueToDegrees(value) * Math.PI / 180;
        }

        function valueToPoint(value, factor) {
            return { x: config.cx - config.raduis * factor * Math.cos(valueToRadians(value)),
                y: config.cy - config.raduis * factor * Math.sin(valueToRadians(value)) };
        }

        function buildPointerPath(value) {
            function valueToPoinCenter(value, factor) {
                var point = valueToPoint(value, factor);
                point.x -= config.cx;
                point.y -= config.cy;
                return point;
            }

            var delta = config.range / 13;
            var head = valueToPoinCenter(value, 0.85);
            var head1 = valueToPoinCenter(value - delta, 0.12);
            var head2 = valueToPoinCenter(value + delta, 0.12);

            var tailValue = value - (config.range * (1 / (270 / 360)) / 2);
            var tail = valueToPoinCenter(tailValue, 0.28);
            var tail1 = valueToPoinCenter(tailValue - delta, 0.12);
            var tail2 = valueToPoinCenter(tailValue + delta, 0.12);

            return [head, head1, tail2, tail, tail1, head2, head];
        }

        exports.render = function (element) {
            var fontSize;
            var major, minor, majorDelta, minorDelta;
            var point, point1, point2;

            body = d3.select(element)
                .select("#" + placeholderName)
                .append("svg:svg")
                .attr("class", "gauge")
                .attr("width", config.size)
                .attr("height", config.size);

            body.append("svg:circle")
                .attr("cx", config.cx)
                .attr("cy", config.cy)
                .attr("r", config.raduis)
                .style("fill", "#ccc")
                .style("stroke", "#000")
                .style("stroke-width", "0.5px");

            body.append("svg:circle")
                .attr("cx", config.cx)
                .attr("cy", config.cy)
                .attr("r", 0.9 * config.raduis)
                .style("fill", "#fff")
                .style("stroke", "#e0e0e0")
                .style("stroke-width", "2px");

            if (config.label !== undefined) {
                fontSize = Math.round(config.size / 9);
                body.append("svg:text")
                    .attr("x", config.cx)
                    .attr("y", config.cy / 2 + fontSize / 2)
                    .attr("dy", fontSize / 2)
                    .attr("text-anchor", "middle")
                    .text(config.label)
                    .style("font-size", fontSize + "px")
                    .style("fill", "#333")
                    .style("stroke-width", "0px");
            }

            fontSize = Math.round(config.size / 16);
            majorDelta = config.range / (config.majorTicks - 1);

            for (major = config.min; major <= config.max; major += majorDelta) {
                minorDelta = majorDelta / config.minorTicks;
                for (minor = major + minorDelta; minor < Math.min(major + majorDelta, config.max); minor += minorDelta) {
                    point1 = valueToPoint(minor, 0.75);
                    point2 = valueToPoint(minor, 0.85);

                    body.append("svg:line")
                        .attr("x1", point1.x)
                        .attr("y1", point1.y)
                        .attr("x2", point2.x)
                        .attr("y2", point2.y)
                        .style("stroke", "#666")
                        .style("stroke-width", "1px");
                }

                point1 = valueToPoint(major, 0.7);
                point2 = valueToPoint(major, 0.85);

                body.append("svg:line")
                    .attr("x1", point1.x)
                    .attr("y1", point1.y)
                    .attr("x2", point2.x)
                    .attr("y2", point2.y)
                    .style("stroke", "#333")
                    .style("stroke-width", "2px");

                if (major === config.min || major === config.max) {
                    point = valueToPoint(major, 0.63);

                    body.append("svg:text")
                        .attr("x", point.x)
                        .attr("y", point.y)
                        .attr("dy", fontSize / 3)
                        .attr("text-anchor", major == config.min ? "start" : "end")
                        .text(major)
                        .style("font-size", fontSize + "px")
                        .style("fill", "#333")
                        .style("stroke-width", "0px");
                }
            }

            var pointerContainer = body.append("svg:g").attr("class", "pointerContainer");
            var midValue = (config.min + config.max) / 2;
            var pointerPath = buildPointerPath(midValue);

            var pointerLine = d3.svg.line()
                .x(function (d) { return d.x; })
                .y(function (d) { return d.y; })
                .interpolate("basis");

            pointerContainer.selectAll("path")
                .data([pointerPath])
                .enter()
                .append("svg:path")
                .attr("d", pointerLine)
                .style("fill", "#dc3912")
                .style("stroke", "#c63310")
                .style("fill-opacity", 0.7);

            pointerContainer.append("svg:circle")
                .attr("cx", config.cx)
                .attr("cy", config.cy)
                .attr("r", 0.12 * config.raduis)
                .style("fill", "#4684EE")
                .style("stroke", "#666")
                .style("opacity", 1);

            fontSize = Math.round(config.size / 10);
            pointerContainer.selectAll("text")
                .data([midValue])
                .enter()
                .append("svg:text")
                .attr("x", config.cx)
                .attr("y", config.size - config.cy / 4 - fontSize)
                .attr("dy", fontSize / 2)
                .attr("text-anchor", "middle")
                .style("font-size", fontSize + "px")
                .style("fill", "#000")
                .style("stroke-width", "0px");

            exports.redraw(0, 0);
        };

        exports.redraw = function (value, transitionDuration) {
            var _currentRotation;

            var pointerContainer = body.select(".pointerContainer");
            pointerContainer.selectAll("text").text(value.toFixed(1));

            var pointer = pointerContainer.selectAll("path");
            pointer.transition()
                .duration(undefined !== transitionDuration ? transitionDuration : config.transitionDuration)
                .attrTween("transform", function () {
                    var pointerValue = value;
                    if (value > config.max) {
                        pointerValue = config.max + 0.02 * config.range;
                    } else if (value < config.min) {
                        pointerValue = config.min - 0.02 * config.range;
                    }
                    var targetRotation = (valueToDegrees(pointerValue) - 90);
                    var currentRotation = _currentRotation || targetRotation;
                    _currentRotation = targetRotation;

                    return function (step) {
                        var rotation = currentRotation + (targetRotation - currentRotation) * step;
                        return "translate(" + config.cx + ", " + config.cy + ") rotate(" + rotation + ")";
                    };
                });
        };

        // initialization
        configure(configuration);

        return exports;
    };

    return gauge;
});
