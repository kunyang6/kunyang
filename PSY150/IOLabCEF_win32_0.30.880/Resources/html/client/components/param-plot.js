angular.module('IOLabApp').factory('paramPlotService', function (helperService, configService, selectionService, chartModeService) {
    'use strict';

    var paramPlot = function (args) {

        var remote = args.remote,
            config = args.config,
            sensor1 = args.sensor1.sensorType,
            sensor2 = args.sensor2.sensorType,
            chartID = remote + '-' + config + '-' + sensor1 + '-' + sensor1,
            sensorLen = {
                1: args.sensor1.sampleSize,
                2: args.sensor1.sampleSize
            },
            sensorCoord = {
                1: -1,
                2: -1
            },
            param = {
                1: configService.getSensor(sensor1) || {},
                2: configService.getSensor(sensor2) || {}
            };

        // Default width and height (setter/getter)
        var width = 560, height = 370;

        // Default margin
        var margin = { top: 25, right: 25, bottom: 45, left: 50 };

        // Chart scales' range
        var defScale = {};
        defScale.x0 = param[1].scales[0] || -20;
        defScale.x1 = param[1].scales[1] || 20;
        defScale.y0 = param[2].scales[0] || -20;
        defScale.y1 = param[2].scales[1] || 20;
        var scale = Object.create(defScale);

        var d3Mouse, d3MouseDown;

        // Variable containing the data to bind. Used also to get the
        // value of t, x1, x2, ... when hovering
        var data = [], dataOrig = [], timeRange, timeRanges, showTimeScale = false;

        // D3 object for the chart rendering
        var svg, chartW, chartH, brushH,
            xScale, yScale, y2Scale, tScale,
            xAxis, yAxis, tAxis,
            line, line2,
            brush;

        /*
         * Cursor selection object
         */
        var selection = selectionService();

        /*
         * Chart Mode object
         */
        var chartMode = chartModeService();

        var dispatch = d3.dispatch(
            'cursorPosition',
            'cursorRange',
            'scaleChanges',
            'setMode'
        );

        var brushed = function() {
            timeRanges = brush.empty() ? null : brush.extent();
            svg.select('g.chart-group')
                .selectAll('path.paths')
                .attr('d', line);
        };

        var resize = {
            active: false,
            d3MouseDown: null,
            d3MouseElement: null
        };
        resize.mousedown = function () {
            resize.active = true;
            resize.d3MouseElement = this;
            resize.d3MouseDown = d3.mouse(this);
        };
        resize.mousemove = function () {
            if (!resize.active) {
                return;
            }
            d3Mouse = d3.mouse(resize.d3MouseElement);
            width += d3Mouse[0] - resize.d3MouseDown[0];
            height += d3Mouse[1] - resize.d3MouseDown[1];
            resize.d3MouseDown = d3Mouse;
            redraw();
        };
        resize.mouseup = function () {
            resize.active = false;
            resize.d3MouseDown = null;
        };

        var mousedown = function () {
            // Needed to check the click at the same position
            d3MouseDown = d3.mouse(this);

            if (selection.p0.locked) {
                selection.reset();
                if (chartMode.zoom) {
                    redrawZoomSelection();
                }
            }

            if (chartMode.stats || chartMode.zoom || chartMode.move) {
                // Keep a copy of the scale
                selection.scale = angular.copy(scale);

                // Lock p0 and keep the value
                selection.p0.locked = true;
                selection.p0.x = xScale.invert(d3MouseDown[0]);
                selection.p0.y = yScale.invert(d3MouseDown[1]);
            }
        };

        var mousemove = function () {
            // Index of the data point corresponding to the mouse position
            d3Mouse = d3.mouse(this);

            // Selection locked (update the selection)
            if (selection.p0.locked) {

                selection.p1.x = xScale.invert(d3Mouse[0]);
                selection.p1.y = yScale.invert(d3Mouse[1]);

                if (chartMode.move) {
                    scale.x0 -= (selection.p1.x - selection.p0.x);
                    scale.x1 -= (selection.p1.x - selection.p0.x);
                    scale.y0 -= (selection.p1.y - selection.p0.y);
                    scale.y1 -= (selection.p1.y - selection.p0.y);
                    redraw();
                }
            }

            if (chartMode.zoom) {
                redrawZoomSelection();
            }
        };

        var mouseout = function () {
            // Erase the cross ...
            d3Mouse = null;
            redrawZoomSelection();
        };

        var mouseup = function () {
            // Set the new scale in zoom mode
            if (chartMode.zoom && selection.notNull()) {
                // Keep the old scale for further use
                chartMode.scales.push(angular.copy(scale));

                scale.x0 = Math.min(selection.p0.x, selection.p1.x);
                scale.x1 = Math.max(selection.p0.x, selection.p1.x);
                scale.y0 = Math.min(selection.p0.y, selection.p1.y);
                scale.y1 = Math.max(selection.p0.y, selection.p1.y);
                selection.reset();
                redraw();
                redrawZoomSelection();
            }
            selection.reset();
        };

        var click = function () {
            var scalesLen = chartMode.scales.length;
            if (chartMode.zoom && !!scalesLen && d3MouseDown[0] === d3.mouse(this)[0]) {
                scale = chartMode.scales.splice(-1, 1)[0];
                redraw();
                redrawZoomSelection();
            }
        };

        var dblclick = function () {
            // Reset the zoom scale to the bbox
            if (chartMode.zoom) {
                bbox();
                chartMode.scales = [];
                redraw();
            }
        };

        var redrawZoomSelection = function () {

            /*
             * Cross
             */
            var crossData = [],
                crossGroup;

            if (chartMode.zoom && d3Mouse && !selection.p0.locked) {
                crossData = [d3Mouse[0], d3Mouse[1]];
            }

            crossGroup = svg.select('.zoom-group')
                .selectAll('.zoom-cross')
                .data(crossData)  // data = [y]
                .attr('x1', function (d, i) { return i ? 1 : d; })
                .attr('x2', function (d, i) { return i ? chartW : d; })
                .attr('y2', function (d, i) { return i ? d : chartH; })
                .attr('y1', function (d, i) { return i ? d : 0; });
            crossGroup.enter()
                .append('line')
                .attr('class', 'zoom-cross')
                .attr({'stroke-width': 1, 'stroke': '#555555'});
            crossGroup.exit().remove();


            /*
             * Rectangle
             */
            var zoomData, zoomGroup;

            if (selection.p0.x !== -1 && selection.p1.x !== -1) {
                zoomData = [{
                    x0: selection.p0.x < selection.p1.x ? selection.p0.x : selection.p1.x,
                    x1: selection.p0.x < selection.p1.x ? selection.p1.x : selection.p0.x,
                    y0: selection.p0.y < selection.p1.y ? selection.p0.y : selection.p1.y,
                    y1: selection.p0.y < selection.p1.y ? selection.p1.y : selection.p0.y
                }];
            } else {
                zoomData = [];
            }

            zoomGroup = svg.select('.zoom-group')
                .selectAll('.zoom-rect')
                .data(zoomData)
                .attr('x', function (d) { return xScale(d.x0); })
                .attr('y', function (d) { return yScale(d.y1); })
                .attr('width', function (d) { return xScale(d.x1) - xScale(d.x0); })
                .attr('height', function (d) { return yScale(d.y0) - yScale(d.y1); });
            zoomGroup.enter()
                .append('rect')
                .attr('class', 'zoom-rect')
                .style({fill: 'none', stroke: '#555555', 'stroke-width': 1.5, 'stroke-dasharray': '6,2'});
            zoomGroup.exit().remove();
        };

        var pathColors = function (d, i) {
            if (param.pathColors) {
                return param.pathColors[i];
            }
            return configService.getDefaultColor(i);
        };

        var redrawPaths = function () {

            svg.select('g.chart-group')
                .selectAll('path.paths')
                .attr('d', line);

            if (showTimeScale) {
                svg.select('g.time-scale-group')
                    .selectAll('path.time-paths')
                    .attr('d', line2);
            }
        };

        var redraw = function () {

            chartW = width - margin.left - margin.right;

            if (showTimeScale) {
                brushH = 80;
                chartH = height - margin.top - margin.bottom - brushH;

                tScale.domain([data[0][0], data.slice(-1)[0][0]]).range([0, chartW]);
                y2Scale.domain([0, 1]).range([chartH + brushH, chartH + margin.bottom * 1.2])

                svg.select('g.t-axis-group.axis')
                    .attr({ transform: 'translate(0, ' + (chartH + brushH) + ')' })
                    .call(tAxis);

                svg.select('g.t.brush')
                    .attr({ transform: 'translate(0, ' + (chartH + margin.bottom * 1.2) + ')' })
                    .call(brush);

                svg.select('g.t.brush')
                    .selectAll('rect')
                    .attr('y', -5)
                    .attr('height', brushH - margin.bottom * 1.2 + 4);

                svg.select('g.t.brush')
                    .selectAll('g.resize')
                    .selectAll('rect')
                    .attr('y', 5)
                    .attr('height', brushH - margin.bottom * 1.2 - 6);

            } else {
                brushH = 0;
                chartH = height - margin.top - margin.bottom;
            }

            xScale.domain([scale.x0, scale.x1]).range([0, chartW]);
            yScale.domain([scale.y0, scale.y1]).range([chartH, 0]);

            xAxis.tickSize(-chartH, 5);
            yAxis.tickSize(-chartW, 5);

            svg.attr({ width: width, height: height });
            svg.attr({ viewBox: "0 0 " + width + " " + height });
            svg.attr({ preserveAspectRatio: "xMidYMid meet" });

            svg.select('g.x-axis-group.axis')
                .attr({ transform: 'translate(0, ' + chartH + ')' })
                .call(xAxis);
            svg.select('g.x-axis-legend')
                .attr({ transform: 'translate(' + chartW / 2 + ', 30)' });

            svg.select('g.y-axis-group.axis')
                .call(yAxis);
            svg.select('g.y-axis-legend')
                .attr({ transform: 'translate(-40 , ' + chartH / 2 + ') rotate(270)' });

            svg.selectAll('.rect-pane')
                .attr({ width: chartW, height: chartH });

            svg.select('circle.resize')
                .attr({ cx: chartW, cy: chartH });

            redrawPaths();
        };

        var coord = function (axis, d) {
            // Norm of the vector !
            if (sensorCoord[axis] == -1) {
                var i, len = sensorLen[axis], norm2 = 0,
                    start = axis == 1 ? 1 : (1 + sensorLen[1]);
                for (i = start; i < (len + start); i++) {
                    norm2 +=  d[i] * d[i];
                }
                return Math.sqrt(norm2);
            }

            // Specific coordinate
            var idx = 1 + sensorCoord[axis];
            if (axis == 2) { idx += sensorLen[1]; }
            return d[idx];
        };

        var bbox = function () {

            var dataArray, delta, min, max;

            // Sensor 1
            dataArray = data.map(function (d) { return coord(1, d) });
            max = Math.max.apply(Math, dataArray);
            min = Math.min.apply(Math, dataArray);
            delta = max - min || 10;

            scale.x0 = min - delta / 4;
            scale.x1 = max + delta / 4;

            // Sensor 2
            dataArray = data.map(function (d) { return coord(2, d) });
            max = Math.max.apply(Math, dataArray);
            min = Math.min.apply(Math, dataArray);
            delta = max - min || 10;

            scale.y0 = min - delta / 4;
            scale.y1 = max + delta / 4;
        };

        /*
         *  Public methods
         */
        function exports(divContainer) {

            if (!svg) {
                svg = divContainer.select('.chart-holder')
                    .append('svg').attr('class', 'chart');

                var container = svg.append('g').classed('container-group', true)
                    .style('-webkit-user-select', 'none')
                    .attr({ transform: 'translate(' + margin.left + ',' + margin.top + ')' });

                container.append('g').classed('x-axis-group axis', true)
                    .append('g').attr('class', 'x-axis-legend')
                    .append('text').text(param[1].desc + ' (' + (param[1].units || ['-'])[0]  + ')')
                    .attr({'text-anchor': 'middle', 'alignment-baseline': 'middle', fill: pathColors(null, 0)})
                    .style({'font-size': 14});

                container.append('g').classed('y-axis-group axis', true)
                    .append('g').attr('class', 'y-axis-legend')
                    .append('text').text(param[2].desc + ' (' + (param[2].units || ['-'])[0]  + ')')
                    .attr({'text-anchor': 'middle', 'alignment-baseline': 'middle', fill: pathColors(null, 1)})
                    .style({'font-size': 14});

                container.append('g').classed('zoom-group', true);

                container.append('g').classed('chart-group', true)
                    .attr('clip-path', 'url(#clip-' + chartID + ')');

                var timeScaleContainer = container
                    .append('g').attr('class', 'time-scale-group');
                timeScaleContainer.append('g').attr('class', 't-paths-group');
                timeScaleContainer.append('g').attr('class', 't-axis-group axis');
                timeScaleContainer.append('g').attr('class', 't brush');

                container.append('clipPath').attr('id', 'clip-' + chartID)
                    .append("rect").classed('clip rect-pane', true);

                container.append("rect").classed('overlay rect-pane', true)
                    .attr({ 'fill': 'none', 'pointer-events': 'all' })
                    .on('mousemove', mousemove)
                    .on('mouseout', mouseout)
                    .on('mouseup', mouseup)
                    .on('mousedown', mousedown)
                    .on('dblclick', dblclick)
                    .on('click', click);

                container.append('circle').classed('resize', true)
                    .attr({ 'r': 5, cursor: 'nwse-resize', 'fill': 'none', 'pointer-events': 'all' })
                    .on('mousedown.resize', resize.mousedown);

                // To cash mouseup while we are outside of the chart
                divContainer
                    .on('mouseup.resize', resize.mouseup)
                    .on('mousemove.resize', resize.mousemove);

                // Scale
                xScale = d3.scale.linear();
                yScale = d3.scale.linear();
                tScale = d3.scale.linear();
                y2Scale = d3.scale.linear();

                // Axis
                xAxis = d3.svg.axis().scale(xScale).orient('bottom').tickPadding(8);
                yAxis = d3.svg.axis().scale(yScale).orient('left').tickPadding(8);
                tAxis = d3.svg.axis().scale(tScale).orient('bottom').tickPadding(8);

                // brush
                brush = d3.svg.brush()
                    .x(tScale)
                    .on("brush", brushed);

                var dataDefined = function (_data) {
                    var len = _data.length,
                        timeEnd = _data[len-1][0];

                    return function (d, i) {
                        if (showTimeScale && timeRanges) {
                            return timeRanges[0] <= i / len * timeEnd &&  i / len * timeEnd <= timeRanges[1];
                        }
                        return i >= len - timeRange / 10;
                    }
                };

                line = function (_data, _idx) {
                    var d3line = d3.svg.line()
                        .interpolate("linear")
                        .x(function (d) { return xScale(coord(1, d)); })
                        .y(function (d) { return yScale(coord(2, d)); })
                        .defined(dataDefined(_data));
                    return d3line(_data);
                };

                line2 = function (_data, _idx) {
                    var dataArray = _data.map(function (d) { return coord(_idx + 1, d) }),
                        max = Math.max.apply(Math, dataArray),
                        min = Math.min.apply(Math, dataArray),

                        d3line = d3.svg.line()
                        .interpolate("linear")
                        .x(function (d) { return tScale(d[0]); })
                        .y(function (d) {
                           return y2Scale((coord(_idx + 1, d) - min) / (max - min));
                        });
                    return d3line(_data);
                };
            }

            redraw();
        }

        // Add or update '.path'
        exports.addData = function (_data) {

            if (data.length && _data.length) {

                // Data length
                var dataLength = data.length,
                    newDataLength = _data.length;

                // Time of the first new data point to add the data array ...
                var startTime = Math.max(data[(dataLength - 1)][0], _data[0][0]);

                // Compute the index of the new data array that corresponds to the
                // the first new data point
                var index = _data.length;
                while (startTime < _data[index - 1][0]) { --index; }

                // Add new point in data array
                for (var n = index; n < newDataLength; n++) {
                    data.push(_data[n]);
                }
            }

            if (!data.length && _data.length) {

                data = _data;
                dataOrig = [];

                // Fast deep  copy...
                data.forEach(function (entry) {
                    dataOrig.push(entry.map(function(d) { return d; }));
                });
            }

            svg.select('g.chart-group')
                .selectAll('path.paths')
                  .data([data])
                  .attr('d', line)
                .enter().append("path")
                  .attr('stroke-width', 1.5)
                  .attr('stroke', pathColors)
                  .attr('fill', 'none')
                  .attr('opacity', 0.8)
                  .attr('class', 'paths');
        };

        // Remove all '.paths'
        exports.removeData = function () {
            data = [];
            svg.select('path.chart-group')
                .selectAll('.paths')
                .remove();
        };

        exports.width = function (_x) {
            if (!arguments.length) {
                return width;
            }
            width = _x;
            return this;
        };

        exports.height = function (_x) {
            if (!arguments.length) {
                return height;
            }
            height = _x;
            return this;
        };

        exports.initScale = function (time) {
            scale.x0 = defScale.x0;
            scale.x1 = defScale.x1;
            scale.y0 = defScale.y0;
            scale.y1 = defScale.y1;
            return this;
        };

        exports.scale = function (_x) {
            if (!arguments.length) {
                return scale;
            }
            scale.x0 = _x.x0;
            scale.x1 = _x.x1;
            scale.y0 = _x.y0;
            scale.y1 = _x.y1;
            return this;
        };

        exports.mode = function (_x) {
            if (!arguments.length) {
                return chartMode.get();
            }
            chartMode.set(_x);
            if (chartMode.move) {
                svg.select('.overlay').attr({ cursor: 'move' });
            } else {
                svg.select('.overlay').attr({ cursor: 'default' });
            }
            return this;
        };

        exports.coordinate = function(idx, coord) {
            if (!arguments.length) {
                return sensorCoord[idx] ;
            }
            sensorCoord[idx] = coord;

            // Update legend if unit changed...
            svg.select('g.' + (idx == 1 ? 'x' : 'y') + '-axis-legend')
                .select('text')
                .text(param[idx].desc + ' (' + (param[idx].units || ['-'])[coord < 0 ? 0 : coord]  + ')');

            // Redraw when modifying the coordinate type...
            if (showTimeScale) {
                bbox();
                redraw();
            }
        };

        exports.timeRange = function(_x) {
            if (!arguments.length) {
                return timeRange;
            }
            timeRange = _x;
            return this;
        };

        exports.showTimeScale = function(_x) {
            if (!arguments.length) {
                return showTimeScale;
            }
            showTimeScale = _x;

            svg.select('g.time-scale-group')
                .attr('display', showTimeScale ? null : 'none');

            svg.select('g.t-paths-group')
                .selectAll('path.time-paths')
                  .data(showTimeScale ? [data, data] : [])
                  .attr('d', line2)
                .enter().append("path")
                  .attr('stroke-width', 1.5)
                  .attr('stroke', pathColors)
                  .attr('fill', 'none')
                  .attr('opacity', 0.8)
                  .attr('class', 'time-paths');

            // Compute bbox ...
            if (showTimeScale) {
                bbox();
            } else {
                brush.clear();
                timeRanges = null;
                scale = angular.copy(defScale);
            }

            redraw();
            return this;
        };

        exports.clean = function () {
            dataOrig = [];
            data = [];
            svg.select('.chart-group')
                .selectAll('.paths')
                .remove();
        };

        d3.rebind(exports, dispatch, 'on');
        return exports;
    };

    return paramPlot;
});

angular.module('IOLabApp').directive('iolabParamPlot', function ($rootScope, $timeout, IOLab, paramPlotService, windowResizeService, helperService, configService, BSON) {
    'use strict';
    return {
        restrict: 'E',
        replace: true,
        scope: true,
        controller: 'paramPlotCtrl',
        templateUrl: 'components/param-plot.tpl.html',
        link: function (scope, element) {

            var remote = scope.plotParams.remote,
                sensor1 = scope.plotParams.sensor1.sensorType,
                sensor2 = scope.plotParams.sensor2.sensorType;

            // D3 class object
            var paramPlot = paramPlotService(scope.plotParams);

            // html chart element
            var chartElement = d3.select(element[0]);

            // Set height & width
            var chartSize = windowResizeService.getChartSize('ParamPlot');
            paramPlot.height(chartSize.height);
            paramPlot.width(chartSize.width);

            // Draw the chart element
            chartElement.call(paramPlot);  // idem 'chart(chartElement);'
            paramPlot(chartElement); // idem chartElement.call(chart);

            var timeoutId,
                startTime = 0;

            // Used to compute loading time
            var t1, t2, t3;

            function updateChart() {
                if (scope.running) {
                    timeoutId = $timeout(function () {
                        IOLab.getSensorData2(
                            addDataToChart,
                            {
                                remote: remote,
                                sensor1: sensor1,
                                sensor2: sensor2,
                                startTime: startTime
                            }
                        );
                    }, 20, false);
                } else {
                    console.log('*** Force cancel timeout !!! ***');
                    $timeout.cancel(timeoutId);
                }
            }

            function addDataToChart(json) {
                var newData = json;

                // if data ...
                if (!!newData.data && !!newData.data.length) {

                    // Keep the start time for the next data query
                    var lastTimeIndex = Math.max(newData.data.length - 1, 0);
                    startTime =  newData.data[lastTimeIndex][0];

                    // Draw a new path
                    paramPlot.addData(newData.data);
                }

                updateChart();
            }

            function loadDataToChart(json) {
                var newData = json;
                t2 = new Date();
                console.log('*** stopDataCallBack - getSensorData:', t2 - t1, 'ms');
                paramPlot.removeData();
                paramPlot.addData(newData.data);
                paramPlot.showTimeScale(true);
                scope.$apply(scope.control.loading = false);
            }

            // Load the data if any when the chart is created !
            if (!IOLab.isNewAcquisition()) {
                if (scope.running) {
                    updateChart();
                } else {
                    t1 = new Date();
                    scope.control.loading = true;
                    IOLab.getSensorData2(loadDataToChart, { remote: remote, sensor1: sensor1, sensor2: sensor2 });
                }
            }

            scope.$on('dataStarted', function () {
                console.log('*** startData ***');
                scope.running = true;
                paramPlot.showTimeScale(false);
                updateChart();
            });

            scope.$on('dataStopped', function () {
                console.log('*** stopData ***');
                scope.running = false;
                paramPlot.showTimeScale(true);
                $timeout.cancel(timeoutId);
            });

            scope.$on('$destroy', function () {
                console.log('*** scope.$on => destroy iolabParamPlot ***');
                paramPlot.clean();
            });

            element.bind('$destroy', function () {
                $timeout.cancel(timeoutId);
                unRegister();
            });

            /*
             *  Resize event handler
             */
            var unRegister = $rootScope.$on('global:resize', function () {

                // Set new values
                var chartSize = windowResizeService.getChartSize('ParamPlot');
                paramPlot.height(chartSize.height);
                paramPlot.width(chartSize.width);

                // Redraw the chart
                paramPlot();
            });

            /*
             *  Plots Controls
             */
            scope.$watch('control.chartMode', function (newVal) {
                paramPlot.mode(newVal.val);
            });
            scope.$watch('control.coordinate1', function (newVal) {
                var index = scope.coordinates1.indexOf(newVal);
                if (scope.coordinates1[0] == 'Norm') { index--; } // Index = -1 if Norm!!!
                paramPlot.coordinate(1, index);
                paramPlot();
            });
            scope.$watch('control.coordinate2', function (newVal) {
                var index = scope.coordinates2.indexOf(newVal);
                if (scope.coordinates2[0] == 'Norm') { index--; } // Index = -1 if Norm!!!
                paramPlot.coordinate(2, index);
                paramPlot();
            });
            scope.$watch('control.timeRange', function (newVal) {
                paramPlot.timeRange(newVal);
                paramPlot();
            });
        }
    };
});

angular.module('IOLabApp').controller('paramPlotCtrl', function ($scope, IOLab, configService, helperService) {
    'use strict';

    $scope.iolabState = IOLab.hardwareState();

    var remote = $scope.plotParams.remote,
        config = $scope.plotParams.config,
        sensor1 = $scope.plotParams.sensor1,
        sensor2 = $scope.plotParams.sensor2,
        param1 = configService.getSensor(sensor1.sensorType) || {},
        param2 = configService.getSensor(sensor2.sensorType) || {};

    // Drop down chart mode
    $scope.chartModes = [
        { val: 'stats', glyphicon: 'glyphicon-stats' },
        { val: 'zoom', glyphicon: 'glyphicon-zoom-in' },
        { val: 'move', glyphicon: 'glyphicon-move' }
    ];

    // Drop down for the coordinate selection
    $scope.coordinates1 = angular.copy(param1.legends || []);
    if ($scope.coordinates1.length > 1
            && $scope.coordinates1[0][0] == $scope.coordinates1[1][0]) {
        $scope.coordinates1.unshift('Norm');
    }
    $scope.coordinates2 = angular.copy(param2.legends || []);
    if ($scope.coordinates2.length > 1
            && $scope.coordinates2[0][0] == $scope.coordinates2[1][0]) {
        $scope.coordinates2.unshift('Norm');
    }

    // Drop down for time range selection
    $scope.timeRanges = [50, 100, 250, 500, 1000, 2000, 5000];

    $scope.isCollapsed = false;
    $scope.running = $scope.iolabState.dongleMode === 16;
    $scope.frequency = 100;
    $scope.sensor1 = sensor1;
    $scope.sensor2 = sensor2;
    $scope.control = {
        dsShow: false,  //used in drop down
        chartMode: $scope.chartModes[0],
        coordinate1: $scope.coordinates1[0],
        coordinate2: $scope.coordinates2[0],
        timeRange: $scope.timeRanges[0]
    };
});
