angular.module('IOLabApp').factory('sensorSelectionService', function ($rootScope, IOLab, fixedConfigurationService, configService) {
    'use strict';

    var type = 'chart',
        exports = {},
        sensors = {},
        ecgSensors = [],
        chartSensors = [],
        parametricPlots = [];

    // List of sensors to diplay. Contains identification variables (remote, config and type)
    sensors[1] = [];
    sensors[2] = [];

    // Register the update sensor callback in fixedConfiguration service
    fixedConfigurationService.registerUpdateSensorCallback(updateSensorList);

    function updateSensorList(remote) {
        var acquisition = IOLab.acquisitionStack()['remote' + remote] || [];
        var acquisitionSensors = acquisition.sensors;

        _.forEach(acquisitionSensors, function (sensor) {
            // Index of the sensor in the scope list
            var idx = _.findIndex(sensors[remote], { sensorType: sensor.sensorType }),
                checked = fixedConfigurationService.isSensorChecked(remote, sensor.sensorType);

            // Add sensor to the sensor list
            if (checked && idx == -1) {
                sensor.desc = configService.getSensor(sensor.sensorType).desc;
                sensor.shortDesc = configService.getSensor(sensor.sensorType).shortDesc;
                sensors[remote].push(sensor);
            }
            // Remove sensor from the sensor list
            if (!checked && idx != -1) {
                sensors[remote].splice(idx, 1);
            }
        });

        if (type == 'chart') {
            parametricPlots[remote] = [];
            // ECG9 ?
            if (_.find(sensors[remote], { sensorType: 241 })) {
                chartSensors[remote] = [];
                ecgSensors[remote] = sensors[remote];
            } else {
                chartSensors[remote] = sensors[remote];
                ecgSensors[remote] = [];
            }
        } else {
            chartSensors[remote] = [];
            if (sensors[remote].length == 1) {
                parametricPlots[remote] = [{
                    remote: remote,
                    config: acquisition.config,
                    sensor1: sensors[remote][0],
                    sensor2: sensors[remote][0]
                }];
            } else if (sensors[remote].length > 1) {
                parametricPlots[remote] = [{
                    remote: remote,
                    config: acquisition.config,
                    sensor1: sensors[remote][0],
                    sensor2: sensors[remote][1]
                }];
            } else {
                parametricPlots[remote] = [];
            }
        }
    }

    // Look for fixed configuration change
    $rootScope.$watch(
        function () {
            var acquisitionStack = IOLab.acquisitionStack();
            return (acquisitionStack.remote1 || {}).config || 0;
        },
        function () {
            // First, clear the sensor list
            sensors[1] = [];
            updateSensorList(1);
        }
    );
    $rootScope.$watch(
        function () {
            var acquisitionStack = IOLab.acquisitionStack();
            return (acquisitionStack.remote2 || {}).config || 0;
        },
        function () {
            // First, clear the sensor list
            sensors[2] = [];
            updateSensorList(2);
        }
    );

    exports.typeChanged = function (_type) {
        type = _type;
        if (sensors[1].length) { updateSensorList(1); }
        if (sensors[2].length) { updateSensorList(2); }
    };

    exports.getChartType = function () {
        return type;
    };

    exports.getSensorLists = function () {
        return {
            ecgSensors: ecgSensors,
            chartSensors: chartSensors,
            parametricPlots: parametricPlots
        };
    };

    return exports;
});

angular.module('IOLabApp')
    .directive('sensorSelection', function (sensorSelectionService) {
        'use strict';

        return {
            restrict: 'E',
            replace: true,
            scope: true,
            templateUrl: 'components/sensor-selection.tpl.html',
            link: function(scope, element, attrs) {

                var remote = parseInt(attrs.remote, 10);
                scope.remote = remote;

                scope.$watch(
                    function () { return sensorSelectionService.getSensorLists(); },
                    function (sensorLists) {
                        scope.ecgSensors = sensorLists.ecgSensors;
                        scope.chartSensors = sensorLists.chartSensors;
                        scope.parametricPlots = sensorLists.parametricPlots;
                    },
                    true
                );
            }
        };
    });
