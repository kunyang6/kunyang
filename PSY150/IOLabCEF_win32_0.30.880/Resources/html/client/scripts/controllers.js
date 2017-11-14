/*globals console, angular, d3*/

angular.module('IOLabApp').controller('mainCtrl', function ($scope, IOLab, configService) {
    'use strict';
    // Give access to the IOLab service
    $scope.IOLab = IOLab;

    $scope.remotesToDisplay = 1;

    $scope.iolabState = IOLab.hardwareState();
    $scope.dongleMode = 'IDLE';

    $scope.$on('hardwareStateChanged', function () {
        $scope.iolabState = IOLab.hardwareState();
        $scope.dongleMode = configService.getDongleMode($scope.iolabState.dongleMode).desc;

        $scope.r1Off = $scope.iolabState.remote1.rfStatus === 0;
        $scope.r2Off = $scope.iolabState.remote2.rfStatus === 0;
        $scope.r1Configured = $scope.iolabState.remote1.configured;
        $scope.r2Configured = $scope.iolabState.remote2.configured;
        $scope.r1Disabled = $scope.r1Off || $scope.r1Configured;
        $scope.r2Disabled = $scope.r2Off || $scope.r2Configured;
    });
});

angular.module('IOLabApp').controller('outputConfigCtrl', function ($scope, $attrs, IOLab) {
    'use strict';

    var remote = parseInt($attrs.remote, 10);

    $scope.remote = remote;
    $scope.showOutputConfig = false;
    $scope.expertOptions = true;

    $scope.$on('showOutputConfig', function (event, arg) {
        if (arg === remote) {
            $scope.showOutputConfig = !$scope.showOutputConfig;
        }
    });

    // For generic output
    $scope.output = {};
    $scope.setOutputConfig = function () {
        IOLab.setOutputConfig(
            remote,
            parseInt($scope.output.sensorID, 10),
            parseInt($scope.output.key, 10),
            parseInt($scope.output.value, 10)
        );
    };

    $scope.$watch('D6Level', function () { IOLab.setOutputConfig(remote, 20, 1, parseInt($scope.D6Level, 10)); });
    $scope.$watch('D6State', function () { IOLab.setOutputConfig(remote, 20, 0, parseInt($scope.D6State, 10)); });

    // Watch the remote on/off status
    $scope.$watch(
        function () { return IOLab.remotesState()['r' + remote + 'Off']; },
        function (newValue) {
            $scope.remoteOff = newValue;
        }
    );

    // Watch the remote output config state changes
    $scope.$watch(
        function () { return IOLab.hardwareState()['remote' + remote].outputConfig; },
        function () {
            $scope.D6Level = IOLab.outputConfigValue(remote, 20, 1) < 1 ? 0 : 1;
            $scope.D6State = IOLab.outputConfigValue(remote, 20, 0) < 2 ? 0 : 2;
        },
        true
    );
});


angular.module('IOLabApp').controller('gaugeCtrl', function ($scope, IOLab, configService) {
    'use strict';
    $scope.sensorDesc = configService.getSensor($scope.sensor.sensorType).desc;
});

angular.module('IOLabApp').controller('alertCtrl', function ($scope) {
    'use strict';
    $scope.alerts = [];

    $scope.$on('alert', function (event, args) {
        $scope.alerts.push(args);
    });

    $scope.addAlert = function (message, type) {
        $scope.alerts.push({message: message, type: type});
    };

    $scope.closeAlert = function (index) {
        $scope.alerts.splice(index, 1);
    };
});

angular.module('IOLabApp').controller('ModalPairingCtrl', function ($scope, $modal) {
    'use strict';
    $scope.open = function (remoteNum) {
        var modalInstance = $modal.open({
            templateUrl: 'views/modal-pairing.html',
            backdrop: 'static',
            controller: function ($scope, $modalInstance, IOLab, configService) {
                $scope.remoteNum = remoteNum;
                $scope.iolabState = IOLab.hardwareState();
                $scope.dongleMode = 'IDLE';

                $scope.getPairStatus = function (remote) {
                    return (remote == 1) ? $scope.iolabState.remote1.pairStatus : $scope.iolabState.remote2.pairStatus;
                };
                $scope.pairRemote = function (remote) {
                    IOLab.pairRemote(parseInt(remote, 10), 1);
                    setTimeout(function () {
                        if ($scope.getPairStatus(remote) != 1) {
                            $scope.stopPairing();
                        }
                    }, 200);
                };
                $scope.unpairRemote = function (remote) {
                    $scope.showFindRemoteMsg = false;
                    IOLab.pairRemote(parseInt(remote, 10), 0);
                };
                $scope.findRemote = function () {
                    IOLab.sendCommand(19); // cmd 0x13
                    $scope.showFindRemoteMsg = true;
                };
                $scope.stopPairing = function () {
                    IOLab.sendCommand(17); // cmd 0x11
                };
                $scope.$watch('iolabState', function () {
                    $scope.r1Off = $scope.iolabState.remote1.rfStatus === 0;
                    $scope.r2Off = $scope.iolabState.remote2.rfStatus === 0;
                    $scope.remote1_Cfd = $scope.iolabState.remote1.configured;
                    $scope.remote2_Cfd = $scope.iolabState.remote2.configured;
                }, true);
                $scope.$on('hardwareStateChanged', function () {
                    $scope.iolabState = IOLab.hardwareState();
                    $scope.dongleMode = configService.getDongleMode($scope.iolabState.dongleMode).desc;
                });
                $scope.ok = function () {
                    $modalInstance.close();
                };

                $scope.findRemote();
                $scope.showFindRemoteMsg = false;
            }
        });
    };
});

angular.module('IOLabApp').controller('OptionsCtrl', function ($scope, $rootScope, $modal, IOLab, configService, fixedConfigurationService) {
    'use strict';

    // In the case we open the modal when the sensors are configured,
    // we need to know in the $watch if the configuration change is
    // due to a calibration process start, or due to the regular
    // acquisition process.
    var calibrationRunning = false,
        gaugeSensor,
        config, // Fix config selected
        sensors = [], // List of sensors from the fixed config
        sensorTypeList = []; // List of sensor to calibrate


    $scope.setCalibration = function (remote, conf) {
        if (remote === 1 && $scope.r1Disabled) return;
        if (remote === 2 && $scope.r2Disabled) return;

        console.log('calibration');
        calibrationRunning = true;
        config = conf;

        if (config === 3) { /*Orientation*/
            sensorTypeList = [
                { sensor: 1, desc: configService.getSensor(1).desc, incl: true },
                { sensor: 2, desc: configService.getSensor(2).desc, incl: true },
                { sensor: 3, desc: configService.getSensor(3).desc, incl: true }
            ];
        }
        if (config === 4) { /*MiniMotion*/
            sensorTypeList = [
                { sensor: 8, desc: configService.getSensor(8).desc, incl: true }   /*Force*/
            ];
        }
        IOLab.setFixedConfig(remote, config, false);
    };

    $scope.setOutputConfig = function (remote) {
        $rootScope.$broadcast('showOutputConfig', remote);
    };

    // Watch for the calibration start (remote 1)
    $scope.$watch(
        function () { return IOLab.hardwareState().remote1.fixedConfig; },
        function (newValue) {
            if (newValue !== 0) {
                if (calibrationRunning) {
                    sensors = IOLab.acquisitionStack().remote1.sensors;
                    gaugeSensor = config === 3 ? sensors[0] : sensors[1];
                    openCalibrationModal(gaugeSensor, sensorTypeList, config, 1);
                }
            } else {
                config = 0;
                sensors = [];
                sensorTypeList = [];
            }
        }
    );

    // Watch for the calibration start (remote 2)
    $scope.$watch(
        function () { return IOLab.hardwareState().remote2.fixedConfig; },
        function (newValue) {
            if (newValue !== 0) {
                if (calibrationRunning) {
                    sensors = IOLab.acquisitionStack().remote2.sensors;
                    gaugeSensor = config === 3 ? sensors[0] : sensors[1];
                    openCalibrationModal(gaugeSensor, sensorTypeList, config, 2);
                }
            } else {
                config = 0;
                sensors = [];
                sensorTypeList = [];
            }
        }
    );

    $scope.$on('dataStopped', function () {
        if (calibrationRunning) {
            IOLab.deleteAcquisition();
            fixedConfigurationService.reset();
            calibrationRunning = false;
        }
    });

    var openCalibrationModal = function (gaugeSensor, sensorTypeList, config, remote) {
        var modalInstance = $modal.open({
            templateUrl: 'views/modal-calibration.html',
            backdrop: 'static',
            resolve: {
                remote: function () { return remote; },
                config: function () { return config; },
                gaugeSensor: function () { return gaugeSensor; },
                sensorTypeList: function () { return sensorTypeList; }
            },
            controller: 'ModalCalibrationCtrl'
        });

        modalInstance.opened.then(
            function () { IOLab.startData(); }
        );

        modalInstance.result.then(
            function () { IOLab.stopData(); },
            function () { IOLab.stopData(); }
        );
    };

    $scope.openDatabaseModal = function () {

        console.log("ici");

        var modalInstance = $modal.open({
            templateUrl: 'views/modal-database.html',
            backdrop: 'static',
            controller: function ($scope, $modalInstance, IOLab, BSON) {

                $scope.collection = "Calibration";
                $scope.bson = "{}";
                $scope.query = "{}";
                $scope.result = "";

                $scope.saveBson = function (query) {
                    var json = eval("(" + query + ")");
                    IOLab.saveBson($scope.collection, json);
                };

                $scope.excuteQuery = function (query) {
                    var json = eval("(" + query + ")");

                    IOLab.executeQuery(function (res) {
                        $scope.result = JSON.stringify(res.result);
                        if (!$scope.$$phase) {
                            $scope.$digest();
                        }
                    }, $scope.collection, json);
                };

                $scope.ok = function () {
                    $modalInstance.close();
                };
            }
        });
    };

});

angular.module('IOLabApp').controller('ModalCalibrationCtrl', function ($scope, $modalInstance, $timeout, IOLab, configService, BSON,
                                                                        remote, config, gaugeSensor, sensorTypeList) {

    'use strict';
    $scope.iolabState = IOLab.hardwareState();

    // Value injected in the controller
    $scope.remote = remote;
    $scope.config = config;
    $scope.sensor = gaugeSensor;
    $scope.sensorTypeList = sensorTypeList;

    // Indicate if we need to display the save button
    $scope.showSaveButton = false;

    // Current calibration step
    $scope.currentStep = 1;
    // Current step percentage
    $scope.currentPercentage = 0;

    // Calibration process itself
    $scope.calibrationData = {};
    $scope.calibrationDataList = [];

    if ($scope.config === 3) {
        $scope.calibrationDataList = [
            { data: [], validated: false, desc: 'Set the device with the x axis up', imagePath: 'images/iolab+x.png' },
            { data: [], validated: false, desc: 'Set the device with the x axis down', imagePath: 'images/iolab-x.png' },
            { data: [], validated: false, desc: 'Set the device with the y axis up', imagePath: 'images/iolab+y.png' },
            { data: [], validated: false, desc: 'Set the device with the y axis down', imagePath: 'images/iolab-y.png' },
            { data: [], validated: false, desc: 'Set the device with the z axis up', imagePath: 'images/iolab+z.png' },
            { data: [], validated: false, desc: 'Set the device with the z axis down', imagePath: 'images/iolab-z.png' }
        ];
    } else if ($scope.config === 4) {
        $scope.calibrationDataList = [
            { data: [], validated: false, desc: 'Set the device on its head (y down)', imagePath: 'images/iolab-y.png' },
            { data: [], validated: false, desc: 'Hang the device from its force probe', imagePath: 'images/iolab-force.png' }
        ];
    }

    // Set up the data array depending on the sensor types to calibrate
    $scope.calibrationDataList.forEach(function (calData) {
        $scope.sensorTypeList.forEach(function (type) {
            calData.data[type.sensor] = [];
        });
    });

    // Number of steps in calibration
    $scope.numOfSteps = Object.getOwnPropertyNames($scope.calibrationDataList).length;
    $scope.currentPercentage = $scope.currentStep / $scope.numOfSteps * 100;

    // Function that returns the next calibration object
    // Set the variable showSaveButton to true if needed
    $scope.getNextcalibrationData = function () {
        $scope.calibrationData = {};
        $scope.calibrationDataList.forEach(function(sensorData) {
            if (sensorData.validated === false && Object.getOwnPropertyNames($scope.calibrationData).length === 0) {
                $scope.calibrationData = sensorData;
            }
        });

        var count = 0;
        $scope.calibrationDataList.forEach(function (sensorData) {
            if (sensorData.validated === true) {
                count++;
            }
        });
        if (count === $scope.calibrationDataList.length) {
            $scope.showSaveButton = true;
        }
    };

    $scope.validateData = function () {
        var timeoutId;

        var callback = function (json) {
            var newData = json;
            var dataMean = [];
            var dataSigma = [];
            var i = 0;

            newData.data.forEach(function (entry) {
                var mean = d3.mean(entry, function (d) { return d[2]; });
                var variance = d3.sum(entry, function (d) {
                    return (d[1] - mean) * (d[1] - mean);
                }) / (entry.length - 1);

                dataMean.push(mean.toFixed(0));
                dataSigma.push(Math.sqrt(variance).toFixed(0));

                $scope.calibrationData.data[newData.sensorType][i++] = parseFloat(mean.toFixed(0));
            });

            // Check if completely fed (if data is empty => validated = false)
            $scope.calibrationData.validated = true;
            $scope.calibrationData.data.forEach(function(data){
                if (data.length === 0) {
                    $scope.calibrationData.validated = false;
                }
            });

            // get the next one if all sensors are validated (callback returned)
            if ($scope.calibrationData.validated) {
                $scope.getNextcalibrationData();
                $scope.currentStep = $scope.currentStep + 1;
                $scope.currentPercentage = $scope.currentStep / $scope.numOfSteps * 100;
            }

            if (!$scope.$$phase) {
                $scope.$digest();
            }
        };

        $scope.sensorTypeList.forEach(function (type) {
            timeoutId = $timeout(function () {
                var params = {
                    remote: $scope.remote,
                    sensor: type.sensor,
                    startTime: -1.8, // 1.8 seconds
                    endTime: -1,      // Last data
                    raw: true
                };

                IOLab.getSensorData(callback, params);

            }, 2000);
        });
    };

    // Save calibration and close modal
    $scope.sendCalibration = function () {
        var i, calData, calDataJson;

        $scope.sensorTypeList.forEach(function (type) {
            if (type.sensor === 1 && type.incl) {
                // Accelerometer calibration ...
                calData = [];
                for (i = 0; i < 6; i++) {
                    calData[i] = $scope.calibrationDataList[i].data[type.sensor];
                }

                calDataJson = {
                    sensor: type.sensor,
                    remoteID: $scope.iolabState['remote' + $scope.remote].remoteID,
                    calibrationDate: new Date(),
                    calOffset: [(calData[0][0] + calData[1][0]) / 2.0,
                            (calData[2][1] + calData[3][1]) / 2.0,
                            (calData[4][2] + calData[5][2]) / 2.0 ],
                    calScale:  [(calData[0][0] - calData[1][0]) / 2.0 / 9.81,
                            (calData[2][1] - calData[3][1]) / 2.0 / 9.81,
                            (calData[4][2] - calData[5][2]) / 2.0 / 9.81 ]
                };
                IOLab.saveCalibration(calDataJson);
            }

            if (type.sensor === 2 && type.incl) {
                // http://www.ngdc.noaa.gov/geomag-web/#igrfwmm
                // Magnetometer calibration ...
                // Belgium  N:19.899 µT, E:  0.210 µT, D: 44.301 µT
                // Chicago  N:19.054 µT, E: -1.249 µT, D: 50.694 µT
                calData = [];
                for (i = 0; i < 6; i++) {
                    calData[i] = $scope.calibrationDataList[i].data[type.sensor];
                }

                calDataJson = {
                    sensor: type.sensor,
                    remoteID: $scope.iolabState['remote' + $scope.remote].remoteID,
                    calibrationDate: new Date(),
                    calOffset: [(calData[0][0] + calData[1][0]) / 2.0,
                            (calData[2][1] + calData[3][1]) / 2.0,
                            (calData[4][2] + calData[5][2]) / 2.0 ],
                    calScale:  [(calData[0][0] - calData[1][0]) / 2.0 / (-50.7),
                            (calData[2][1] - calData[3][1]) / 2.0 / (-50.7),
                            (calData[4][2] - calData[5][2]) / 2.0 / (-50.7) ]
                };
                IOLab.saveCalibration(calDataJson);
            }

            if (type.sensor === 3 && type.incl) {
                // Gyroscope calibration ...
                calData = [];
                for (i = 0; i < 6; i++) {
                    calData[i] = $scope.calibrationDataList[i].data[type.sensor];
                }

                calDataJson = {
                    sensor: type.sensor,
                    remoteID: $scope.iolabState['remote' + $scope.remote].remoteID,
                    calibrationDate: new Date(),
                    calOffset: [(calData[0][0] + calData[1][0]) / 2.0,
                            (calData[2][1] + calData[3][1]) / 2.0,
                            (calData[4][2] + calData[5][2]) / 2.0 ]
                };
                IOLab.saveCalibration(calDataJson);
            }

            if (type.sensor === 8 && type.incl) {
                // Force probe calibration ... scale : 2.08 [N] = 0.212 [kg] * 9.81 [m/s^2]
                calData = [];
                for (i = 0; i < 2; i++) {
                    calData[i] = $scope.calibrationDataList[i].data[type.sensor];
                }

                calDataJson = {
                    sensor: type.sensor,
                    remoteID: $scope.iolabState['remote' + $scope.remote].remoteID,
                    calibrationDate: new Date(),
                    calOffset: (calData[0][0] - 0x7FF),
                    calScale: (calData[0][0] - calData[1][0]) / 2.08
                };
                IOLab.saveCalibration(calDataJson);
            }
        });

        // Close modal
        $modalInstance.close();
    };

    // Close modal
    $scope.ok = function () {
        $modalInstance.close();
    };

    // Start the acquisition and get the first calibrationData object
    $scope.getNextcalibrationData();
});
