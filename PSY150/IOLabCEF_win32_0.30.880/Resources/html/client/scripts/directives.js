/*globals console, angular, d3*/

angular.module('IOLabApp').directive('iolabGauge', function ($timeout, IOLab, BSON, gaugeService, configService) {
    'use strict';
    return {
        restrict: 'E',
        replace: true,
        controller: 'gaugeCtrl',
        templateUrl: 'views/tpl-gauge.html',
        link: function (scope, element, attrs) {

            var remote = scope.sensor.remote,
                sensor = scope.sensor.sensorType,
                sampleSize = scope.sensor.sampleSize;

            var gauges = [];
            var gaugeElement = d3.select(element[0]);

            var createGauge = function (name, label) {

                var config = {
                    size: 150,
                    label: label,
                    min: -20,
                    max: 20,
                    minorTicks: 5
                };

                gauges[name] = gaugeService(name, config);

                d3.select(element[0]).each(function () {
                    gauges[name].render(this);
                });
            };

            var gaugeName = function (nbr) {
                return 'gauge-' + remote + '-' + sensor + '-' + nbr;
            };

            // Create the html tag and gauge object
            for (var i = 0; i < sampleSize; i++) {
                gaugeElement.select('.gauge').append("span").attr('id', gaugeName(i));
                createGauge(
                    gaugeName(i),
                    configService.getSensor(sensor).shortDesc + '-' + ((sampleSize == 1) ? 'y' : ((i == 0) ? 'x' : ((i == 1) ? 'y' : 'z')))
                );
            }

            var timeoutId, timeInteval = 50;
            var newData = [], dataLength, startTime = 0;

            function addDataToChart(json) {
                newData = json;

                if (!newData.datalength) {
                    updateChart();
                    return;
                }

                dataLength = newData.data[0].length;
                for (var i = 0; i < sampleSize; i++) {
                    gauges[gaugeName(i)].redraw(newData.data[i][dataLength - 1][1], timeInteval);
                }
                startTime = newData.data[0][dataLength - 1][0];

                updateChart();
            }

            function updateChart() {
                timeoutId = $timeout(function () {
                    IOLab.getSensorData(addDataToChart, { remote: remote, sensor: sensor, startTime: startTime });
                }, timeInteval, false);
            }

            element.bind('$destroy', function () {
                $timeout.cancel(timeoutId);
            });


            scope.$on('dataStarted', function () {
                    console.log('*** startData ***');
                    updateChart();
            });
            scope.$on('dataStopped', function () {
                    console.log('*** stopData ***');
                    $timeout.cancel(timeoutId);

                    for (var key in gauges) {
                        gauges[key].redraw(0, timeInteval);
                    }
            });

        }
    }
});

angular.module('IOLabApp').directive('outputConfig', function() {
    'use strict';
    return {
        restrict: 'E',
        replace: true,
        scope: true,
        controller: 'outputConfigCtrl',
        templateUrl: 'views/tpl-output-config.html'
    }
});

angular.module('IOLabApp').directive('chartDraggable', function($document) {
    return function(scope, element) {

        var startX = 0, startY = 0, x = 0, y = 0;

        element.parent().parent().css({
            position: 'relative',
            backgroundColor: 'white'
        });

        element.css({
            cursor: 'pointer'
        });

        element.on('mousedown', function(event) {
            // Prevent default dragging of selected content
            event.preventDefault();
            startX = event.pageX - x;
            startY = event.pageY - y;
            $document.on('mousemove', mousemove);
            $document.on('mouseup', mouseup);

            element.parent().parent().css({
                zIndex: 1 // => z-index style !
            });
        });

        function mousemove(event) {
            y = event.pageY - startY;
            x = event.pageX - startX;
            element.parent().parent().css({
                top: y + 'px',
                left:  x + 'px'
            });
        }

        function mouseup() {
            $document.unbind('mousemove', mousemove);
            $document.unbind('mouseup', mouseup);
        }
    };
});
