angular.module('IOLabApp').directive('iolabEcgChart', function () {
    'use strict';
    return {
        restrict: 'E',
        replace: true,
        controller: 'chartCtrl',
        templateUrl: 'components/chart.ecg.tpl.html'
    };
});

angular.module('IOLabApp').directive('iolabEcgSvg', function ($rootScope, $timeout, IOLab, chartService, windowResizeService, helperService, configService, BSON, sharedChartService) {
    'use strict';
    return {
        restrict: 'E',
        replace: true,
        template: '<div ng-show="control.legendSettings[coord].show"><div class="chart-holder"></div></div>',
        link: function (scope, element) {

            // D3 class object
            var chart = chartService(scope.sensor, scope.coord);

            // html chart element
            var chartElement = d3.select(element[0]);

            // Set height & width
            var chartSize = windowResizeService.getChartSize();
            chart.width(chartSize.width);

            // Draw the chart element
            chart(chartElement); // idem chartElement.call(chart);

            var remote = scope.sensor.remote,
                sensorType = scope.sensor.sensorType;

            var timeoutId,
                newData = [],
                overlap = 0,
                startTime = 0,
                samplingRate = 1,
                computeSamplingRate = true,
                pathNbr = 1;

            // Used to compute loading time
            var t1, t2, t3;

            function updateChart() {
                if (scope.control.running) {
                    timeoutId = $timeout(function () {
                        IOLab.getSensorData(
                            addDataToChart,
                            { remote: remote, sensor: sensorType, startTime: startTime, coord: scope.coord }
                        );
                    }, 25, false);
                } else {
                    console.log('*** Force cancel timeout !!! ***');
                    $timeout.cancel(timeoutId);
                }
            }

            function addDataToChart(json) {
                newData = json;

                // if new data empty return
                if (!newData.datalength) {
                    updateChart();
                    return;
                }

                // Check the resampling the first time
                if (computeSamplingRate) {
                    computeSamplingRate = false;
                    samplingRate = chart.resampling(newData.sampleRate);
                }

                // First and last data point (time)
                var dataLength = newData.data[0].length;
                var firstPoint = newData.data[0][0][0];
                var lastPoint = newData.data[0][dataLength - 1][0];

                // Shift the time axis if we are at the end
                if (lastPoint >= chart.scale().x1) {
                    samplingRate = chart.resampling(newData.sampleRate);
                    startTime = chart.scale().x1;
                    chart.removeData();
                    chart.addData(newData.data, 'path' + (++pathNbr));
                    chart.shiftTimeScale(lastPoint);
                    chart(chartElement);
                    updateChart();
                    return;
                }

                // Draw a new path
                chart.addData(newData.data, 'path' + (++pathNbr), overlap);

                var samplingOverlap = Math.max(dataLength - 1, 0) % (2 * samplingRate) + 1;
                // Keep the start time for the next data query
                startTime =  newData.data[0][Math.max(dataLength - 1 - (samplingOverlap), 0)][0];

                updateChart();
            }

            function loadDataToChart(json) {
                newData = json;
                t2 = new Date();
                console.log('*** stopDataCallBack - getSensorData:', t2 - t1, 'ms');
                chart.removeData();
                chart.bbox(newData.boundingBox);
                chart.addData(newData.data, 'path0');
                chart.resampling(newData.sampleRate);
                chart.smoothingPath(scope.control.timeAverage);
                chart(chartElement);
                scope.$apply(scope.control.loading = false);
            }

            // Load the data if any when the chart is created !
            if (!IOLab.isNewAcquisition()) {
                if (scope.control.running) {
                    computeSamplingRate = true;
                    chart.smoothingPath(1);
                    chart.initScale(startTime);
                    chart(chartElement);
                    updateChart();
                } else {
                    t1 = new Date();
                    scope.control.loading = true;
                    IOLab.getSensorData(loadDataToChart, { remote: remote, sensor: sensorType, coord: scope.coord });
                }
            }

            scope.$on('dataStarted', function () {
                console.log('*** startData ***');
                computeSamplingRate = true;
                chart.smoothingPath(1);
                chart.initScale(startTime);
                chart(chartElement);
                updateChart();
            });

            scope.$on('dataStopped', function () {
                console.log('*** stopData ***');
                t1 = new Date();
                // Cancel the timeout
                $timeout.cancel(timeoutId);
                // Get all the data after calibration
                scope.control.loading = true;
                IOLab.getSensorData(loadDataToChart, { remote: remote, sensor: sensorType, coord: scope.coord });
            });

            scope.$on('$destroy', function () {
                console.log('*** scope.$on => destroy Chart ***');
                chart.clean();
                try{
                    chart.on('cursorPosition', null);
                    chart.on('cursorRange', null);
                    chart.on('fftResult', null);
                    chart.on('fftInit', null);
                    chart.on('scaleChanges', null);
                    chart.on('setMode', null);
                } catch(err) {}
                unRegister();
            });

            element.bind('$destroy', function () {
                $timeout.cancel(timeoutId);
            });

            /*
             *  Resize event handler
             */
            var unRegister = $rootScope.$on('global:resize', function () {

                // Set new values
                var chartSize = windowResizeService.getChartSize();
                chart.width(chartSize.width);

                // Redraw the chart
                chart();
            });

            /*
             *  Scale changed from the chart
             */
            var emittingChart = false;
            chart.on('scaleChanges', function (scale) {
                emittingChart = true;
                scope.$apply(sharedChartService.scales = scale);
            });
            scope.$watch(
                function () { return sharedChartService.scales; },
                function (newScales) {
                    if (!newScales) {
                        return;
                    }
                    if (emittingChart) {
                        emittingChart = !emittingChart;
                        return;
                    }
                    chart.scale(newScales);
                    chart();
                },
                true
            );

            /*
             *  Cursor position (update of the legend)
             */
            chart.on('cursorPosition', function (d) {
                scope.$apply(sharedChartService.cursorPosition = d);
            });
            scope.$watch(
                function () { return sharedChartService.cursorPosition; },
                function (newCursorPosition) {
                    if (newCursorPosition) {
                        chart.redrawLegend(newCursorPosition);
                    }
                }
            );

            /*
             *  Cursor range (update statistics)
             */
            chart.on('cursorRange', function (d) {
                scope.$apply(sharedChartService.cursorRange = d);
            });
            scope.$watch(
                function () { return sharedChartService.cursorRange; },
                function (newCursorRange) {
                    if (newCursorRange) {
                        chart.redrawStatistics(newCursorRange);
                    }
                },
                true
            );

            /*
             *  Mode changed from the chart
             */
            chart.on('setMode', function (newMode) {
                scope.chartModes.forEach(function (mode) {
                    if (mode.val === newMode) {
                        scope.control.chartMode = mode;
                    }
                });
            });

            /*
             *  Chart Controls
             */
            scope.$watch('control.chartMode', function (newVal) {
                chart.mode(newVal.val);
            });
            scope.$watch('control.timeAverage', function () {
                if (scope.control.running) { return; }
                chart.smoothingPath(scope.control.timeAverage);
            });
            scope.$watch('control.legendSettings', function () {
                chartElement.call(chart.showPaths(scope.control.legendSettings));
            }, true);
        }
    };
});
