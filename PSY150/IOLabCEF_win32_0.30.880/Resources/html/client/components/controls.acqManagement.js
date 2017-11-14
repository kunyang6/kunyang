angular.module('IOLabApp').controller('ModalAcquisitionCtrl', function ($scope, $timeout, IOLab, configService, fixedConfigurationService, acquisitionManagementCmd) {
    'use strict';

    var amCMD = acquisitionManagementCmd;

    IOLab.acquisitionManagement(function (json) {
        $scope.$apply(function () {
            $scope.acquisitionList = json.acquisitionList;
        });
    }, amCMD.GetList);

    $scope.reloadAcquisition = function (acqID) {
        $scope.$close();
        fixedConfigurationService.reset();
        IOLab.deleteAcquisition();
        $timeout(function () {
            IOLab.acquisitionManagement(function () {}, amCMD.Reload, acqID);
        }, 250);
    };

    $scope.deleteAcquisition = function (acqID) {
        IOLab.acquisitionManagement(function (json) {
            $scope.$apply(function () {
                $scope.acquisitionList = json.acquisitionList;
            });
        }, amCMD.Delete, acqID);
    };

    $scope.acqID = (IOLab.acquisitionStack() || {}).ID;

    $scope.configDesc = function (acq, remote) {
        return configService.getFixedConfig(acq['remote' + remote].fixedConfig).desc;
    };
    $scope.sensors = function (acq, remote) {
        var sensors = configService.getFixedConfig(acq['remote' + remote].fixedConfig).sensors;
        return _.map(sensors, function (sensor) {
            var res = configService.getSensor(sensor.sensorKey);
            res.sampleRate = sensor.sampleRate;
            return res;
        });
    };
});
