angular.module('IOLabApp').directive('controls', function() {
    'use strict';
    return {
        restrict: 'E',
        replace: true,
        controller: 'controlsCtrl',
        templateUrl: 'components/controls.tpl.html'
    };
});

angular.module('IOLabApp').controller('controlsCtrl', function ($scope, $rootScope, $timeout, $modal, IOLab, fixedConfigurationService, sensorSelectionService, BSON) {
    'use strict';

    /*
     *  Start, stop and reset controls
     */

    $scope.startData = function () {
        IOLab.startData();
    };

    $scope.stopData = function () {
        IOLab.stopData();
    };

    $scope.resetDataAndConfig = function () {
        $scope.remote1Disabled = $scope.r1Off;
        $scope.remote2Disabled = $scope.r2Off;
        $scope.remote12Disabled = $scope.r1Off || $scope.r2Off;
        if ($scope.remote2Disabled) {
            $scope.remotesToDisplay = 1;
        }

        // Acquisition stack contains no data or contains data from DB
        // In that case, completely rest the acquisition
        if (IOLab.isNewAcquisition() || 
            IOLab.acquisitionStack().fromDB) {

            IOLab.deleteAcquisition();
            fixedConfigurationService.reset();

        } else {

            // Otherwise, clear the acquisition and prepare
            // for a new acquisition with the same fixed configuration
            IOLab.deleteAcquisition()
                .then(IOLab.getAcquisitionStack)
                .then(function() {
                    fixedConfigurationService.checkFixedConfig(1);
                    fixedConfigurationService.checkFixedConfig(2);
                });
        }
    };

    $scope.acquisitionManagement = function () {
        $modal.open({
            templateUrl: 'components/controls.acqManagement.modal.html',
            backdrop: 'static',
            controller: 'ModalAcquisitionCtrl'
        });
    };

    /*
     *  Type management (chart vs parametric plot)
     */

    $scope.type = sensorSelectionService.getChartType();
    $scope.$watch('type', function (newType, oldType) {
        if (newType != oldType) {
            sensorSelectionService.typeChanged($scope.type);
        }
    });

    /*
     *  Single vs Two remotes mode management
     */

    // Initial values
    $scope.remote1Disabled = false;
    $scope.remote2Disabled = false;
    $scope.remote12Disabled = false;

    // Watch change in variables defined in the mainCtrl
    $scope.$watchCollection('[r1Off, r2Off]', function (oldValue, newValue) {

        // True when no data acquired...
        var isNewAcquisition = IOLab.isNewAcquisition();

        // Do not disable the buttons if there are some data for the remote
        $scope.remote1Disabled = $scope.r1Off && (isNewAcquisition || $scope.iolabState.remote1.fixedConfig === 0);
        $scope.remote2Disabled = $scope.r2Off && (isNewAcquisition || $scope.iolabState.remote2.fixedConfig === 0);
        $scope.remote12Disabled = $scope.remote1Disabled || $scope.remote2Disabled;

        if ($scope.remote1Disabled && !$scope.remote2Disabled) {
            $scope.remotesToDisplay = 2;
        }
        if ($scope.remote2Disabled && !$scope.remote1Disabled) {
            $scope.remotesToDisplay = 1;
        }
    });

    // When changing remote to display, send a resize event.
    $scope.$watch('remotesToDisplay', function () {
        // Broadcast 'global:resize' to resize the charts (wait the DOM update)
        $timeout(function () {$rootScope.$broadcast('global:resize'); }, 1100);
    });
});
