angular.module('IOLabApp').factory('fixedConfigurationService', function ($rootScope, $timeout, IOLab, configService) {
    'use strict';

    var exports = {
            sensors: []
        },
        updateSensorCallbackStack = [],
        selectedConfig = { 1: 0, 2: 0 },
        sensorConfigs = configService.getSensorConfigs();

    // Returns the available configurations depending
    // on the selected sensors
    function getAvailableConfigs(remote) {
        var configs = [];

        // Check is some sensors have been checked
        var someSensorsChecked = _.some(exports.sensors[remote], function (item) {
            return item.checked === true;
        });

        // If no sensor checked, return the total list of fixed configurations
        if (!someSensorsChecked) {
            return _.uniq(_.map(sensorConfigs, 'configKey'));
        }

        angular.forEach(exports.sensors[remote], function (sensor) {

            if (sensor.checked) {
                // config keys for the checked sensor
                var currentSensorConfigs = _.unique(
                    _.map(_.filter(sensorConfigs, {sensorKey: sensor.code}), 'configKey')
                );

                if (configs.length === 0) {
                    // Initialize the configs array with the configs of
                    // the first sensor
                    configs = currentSensorConfigs;
                } else {
                    // Remove the configurations from the configs array
                    // if the configuration is not compatible with the
                    // current sensor
                    _.remove(configs, function (item) {
                        return currentSensorConfigs.indexOf(item) < 0;
                    });
                }
            }
        });

        //console.log('getAvailableConfig', configs, remote);

        return configs;
    }

    // Select the configuration (with the highest frequency)
    function selectConfig(remote, availableConfigs) {
        var checkedSensors = _.filter(exports.sensors[remote], function (sensor) {
            return sensor.checked === true;
        });
        var firstSelectedSensor = checkedSensors.length !== 0 ? checkedSensors[0].code : 0;
        var highestRate = 0;
        var configs = [];
        selectedConfig[remote] = 0;

        // Fill the configs array with possible configuration keys and sample rates for the firstSelectedSensor
        angular.forEach(availableConfigs, function (aCvalue) {
            angular.forEach(sensorConfigs, function (sCvalue) {
                if (aCvalue == sCvalue.configKey && sCvalue.sensorKey == firstSelectedSensor) {
                    configs.push({ configKey: sCvalue.configKey, sampleRate: sCvalue.sampleRate });
                }
            });
        });

        // Go through the configs array and find the highest sample rate and its corresponding config key
        angular.forEach(configs, function (value) {
            if (parseInt(value.sampleRate, 10) > parseInt(highestRate, 10)) {
                highestRate = value.sampleRate;
                selectedConfig[remote] = value.configKey;
            }
        });
    }

    // Set the property 'available' of the sensors depending
    // on the availableConfigs
    function setAvailableSensors(remote, availableConfigs) {
        var availableSensors = [];

        if (!availableConfigs) {
            availableConfigs = getAvailableConfigs(remote);
        }

        angular.forEach(availableConfigs, function (configKey) {
            // List of sensor for the configKey
            var sensorList = _.map(_.filter(sensorConfigs, {configKey: configKey}), function (sensorConfig) {
                return sensorConfig.sensorKey;
            });
            availableSensors = _.unique(availableSensors.concat(sensorList));
        });

        angular.forEach(exports.sensors[remote], function (sensor) {
            sensor.available = availableSensors.indexOf(sensor.code) >= 0;
        });
    }

    // Set the property 'sampleRate' of the sensors depending
    // on the selected configuration
    function setSampleRate(remote) {

        // Sensor properties of the selected configuration
        var configSensors = _.filter(sensorConfigs, {configKey: selectedConfig[remote]});

        // Update the sampleRate property of exports.sensors[remote]
        angular.forEach(exports.sensors[remote], function (sensor) {
            var configSensor = _.filter(configSensors, {sensorKey: sensor.code});
            sensor.sampleRate = configSensor.length === 0 ? undefined : configSensor[0].sampleRate;
        });

        //console.log('setSampleRate', exports.sensors[remote]);
    }

    // Initialisation (to be done when the service is instanciated)
    function init(remote) {
        if (arguments.length === 0) {
            init(1);
            init(2);
            return;
        }

        // Initialize the sensors list
        exports.sensors[remote] = configService.getSensors();
        setAvailableSensors(remote);

        var acquisitionStack = IOLab.acquisitionStack(),
            currentConfig = (acquisitionStack['remote' + remote] || {}).config || 0;

        if (currentConfig !== 0) {
            selectedConfig[remote] = currentConfig;
            setAvailableSensors(remote, [currentConfig]);
            setSampleRate(remote);

            // Select all the available sensors
            _.forEach(exports.sensors[remote], function (sensor) {
                sensor.checked = sensor.available;
            });
            //$rootScope.$broadcast('updateSensor', remote);
            execUpdateSensorCallbacks(remote);
        }
    }

    function execUpdateSensorCallbacks(remote) {
        _.forEach(updateSensorCallbackStack, function(callback) {
            return callback(remote);
        });
    }

    // To be called each time we want to reset the service to fresh state
    exports.reset = function (remote) {
        if (arguments.length === 0) {
            exports.reset(1);
            exports.reset(2);
            return;
        }
        // Initialize the sensors list and set the available sensors
        exports.sensors[remote] = configService.getSensors();
        setAvailableSensors(remote);
        selectedConfig[remote] = 0;
    };

    // Check if we need to send to the API an fixed config change
    // depending on the current config from of the API and the
    // selectedConfig[remote] variable
    exports.checkFixedConfig = function (remote) {

        if (IOLab.isNewAcquisition()) {
            var acquisitionStack = IOLab.acquisitionStack(),
                currentConfig = (acquisitionStack['remote' + remote] || {}).config || 0;

            // Not yet configured
            if (currentConfig === 0) {

                if (selectedConfig[remote] !== 0) {
                    IOLab.setFixedConfig(remote, parseInt(selectedConfig[remote], 10), true);
                }

            } else {

                if (selectedConfig[remote] == currentConfig) {
                    //$rootScope.$broadcast('updateSensor', remote);
                    execUpdateSensorCallbacks(remote);

                } else {

                    if (selectedConfig[remote] !== 0) {
                        IOLab.setFixedConfig(remote, parseInt(selectedConfig[remote], 10), true);
                    } else {
                        IOLab.deleteAcquisition();
                    }

                    // If the other remote is configured, we need to reset it
                    // after the deleteAcquisition...
                    var otherRemote = remote == 1 ? 2 : 1,
                        config = parseInt(selectedConfig[otherRemote], 10);
                    if (config !== 0) {
                        IOLab.setFixedConfig(otherRemote, config, true);
                    }
                }
            }
        }
    };

    // Function called each time a sensor is checked
    exports.sensorChecked = function (remote, sensor) {

        if (IOLab.isNewAcquisition()) {
            sensor.checked = !sensor.checked;

            // Retrieve the available configurations with the selected sensor
            var availableConfigs = getAvailableConfigs(remote);

            selectConfig(remote, availableConfigs);
            setSampleRate(remote);
            setAvailableSensors(remote, availableConfigs);

            exports.checkFixedConfig(remote);
        }

        if (!IOLab.isNewAcquisition() && sensor.sampleRate) {
            sensor.checked = !sensor.checked;

            //$rootScope.$broadcast('updateSensor', remote);
            execUpdateSensorCallbacks(remote);
        }
    };

    exports.isSensorChecked = function (remote, sensorKey) {
        var sensorObj = _.filter(exports.sensors[remote], { code: sensorKey });
        return sensorObj.length !== 0 ? !!sensorObj[0].checked : false;
    };

    exports.registerUpdateSensorCallback = function (callback) {
        updateSensorCallbackStack.push(callback);
    };

    // Set the sensors which are not in the current config not available
    // when entering in data mode
    $rootScope.$on('hardwareStateChanged', function () {
        if (IOLab.hardwareState().dongleMode === 16) { /* DATA mode */
            setAvailableSensors(1, [selectedConfig[1]]);
            setAvailableSensors(2, [selectedConfig[2]]);
        }
    });

    // Init the sensor selector when loading acquisition ...
    $rootScope.$watch(
        function () { return (IOLab.acquisitionStack() || {}).ID; },
        function (newVal, oldVal) {
            var fromDB = IOLab.acquisitionStack().fromDB;
            if (fromDB && newVal !== oldVal) {
                init();
            }
        }
    );

    // Update the sensorConfigs when entering/leaving two remote mode
    $rootScope.$watch(
        function () { return IOLab.remotesState(); },
        function (remoteState) {

            // Reset the global sensorConfigs variable
            sensorConfigs = configService.getSensorConfigs();

            // Function to check if the selected config (if any) is still
            // compatible with the low speed configs (two remotes mode)
            function checkConfig(remote) {
                var availableConfigs = getAvailableConfigs(remote);
                if (IOLab.isNewAcquisition() &&
                    selectedConfig[remote] !== 0 &&
                    availableConfigs.indexOf(selectedConfig[remote]) === -1) {

                    // Try to select a config based on the available configs
                    selectConfig(remote, availableConfigs);

                    // If no fixed config corresponds to the selected sensors
                    // reset the checked sensors
                    if (selectedConfig[remote] === 0) {
                        // Reset the checked attributes of all sensors
                        angular.forEach(exports.sensors[remote], function (sensor) {
                            sensor.checked = false;
                        });
                        // Feed the availableConfig array with all the low speed configs
                        availableConfigs = getAvailableConfigs(remote);
                    }
                    setSampleRate(remote);
                    setAvailableSensors(remote, availableConfigs);
                    exports.checkFixedConfig(remote);
                }
            }

            // When the two remote are on, check
            if (!remoteState.r1Off && !remoteState.r2Off) {

                // Filter the sensorConfigs to remove highSpeed configs
                sensorConfigs = _.filter(sensorConfigs, { highSpeed: false });

                checkConfig(1);
                checkConfig(2);
            }
        },
        true
    );

    // Initialisation of the service
    init();

    return exports;
});

angular.module('IOLabApp').directive('fixedConfiguration', function() {
    'use strict';
    return {
        restrict: 'E',
        replace: true,
        scope: true,
        controller: 'fixedConfigurationCtrl',
        templateUrl: 'components/fixed-configuration.tpl.html'
    };
});

angular.module('IOLabApp').controller('fixedConfigurationCtrl', function ($scope, $attrs, IOLab, fixedConfigurationService) {
    'use strict';

    var selector = fixedConfigurationService,
        remote = parseInt($attrs.remote, 10);

    $scope.remote = remote;
    $scope.fixedConfigService = fixedConfigurationService;

    // When the dongle enter in CONNECTED mode, try to set the fixed config
    // if already set in the sensor selector.
    $scope.$watch(
        function () { return IOLab.hardwareState().dongleMode; },
        function (newValue, oldValue) {
            // Check if the new dongle state is CONNECTED
            if (newValue === 8 && oldValue !== 8) {
                selector.checkFixedConfig(remote);
            }
        }
    );

    // When two remotes are paired, we need to check when a remote is powered on
    // if we need to set the fixed config for that remote. Note that we need also to
    // check the dongle mode since the rfStatus is sent before the dongle mode is set
    // to CONNECTED.
    $scope.$watch(
        function () {return IOLab.hardwareState()['remote' + remote].rfStatus; },
        function (newValue, oldValue) {
            // Check if the remote is now powered on & in CONNECTED mode
            if (newValue !== 0 && oldValue === 0 &&
                    IOLab.hardwareState().dongleMode === 8) {
                selector.checkFixedConfig(remote);
            }
        }
    );
});
