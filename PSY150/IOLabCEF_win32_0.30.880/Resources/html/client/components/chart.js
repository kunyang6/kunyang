angular.module('IOLabApp').factory('chartService', function (helperService, configService, chartModeService, selectionService) {
    'use strict';

    var chart = function (_sensor, _coord) {

        var remote = _sensor.remote,
            config = _sensor.config,
            sensor = _sensor.sensorType,
            coord = _coord,

            chartID = remote + '-' + config + '-' + sensor + (coord ? ('-' + coord) : ''),
            param = configService.getSensor(sensor) || {},

            ecg9 = coord != undefined,
            ecgHeight = 600;

        // Default width and height (setter/getter)
        var width = 700, height = 400;

        // Default margin
        var margin = { top: 25, right: 20, bottom: 30, left: 30 };

        // Scale Factors
        var scaleFactors = param.scaleFactors || [1];

        // Chart scales' range
        var defScale = { x0: 0, x1: 10, y0: -20, y1: 20 };
        if (param.scales) {
            defScale.y0 = param.scales[0];
            defScale.y1 = param.scales[1];
        }
        var scale = angular.copy(defScale);
        var bbox = {};

        // Chart paths (used to show/hide paths)
        var chartPaths = [];

        // Sampling control variables
        var minScalingRate = param.minScalingRate || 2,
            samplingRate = 1,
            frequency = 100;

        // FFT sampling rate and spectrum
        var fftSamplingRate = null,
            fftResult = null,
            fftLocked = false,
            d3Mouse = null,
            d3MouseDown = null;

        // Time average on side points (total points for smoothing 2 * sidePoints + 1 )
        var sidePoints = 0;

        // Cursor position
        var cursorPosition = -1;
        var cursorRange = {t0: -1, t1: -1};

        /*
         * Cursor selection object
         */
        var selection = selectionService();

        /*
         * Chart Mode object
         */
        var chartMode = chartModeService();

        // Variable containing the data to bind. Used also to get the
        // value of t, x1, x2, ... when hovering
        var data = [], dataOrig = [];

        // D3 object for the chart rendering
        var svg, chartW, chartH, xScale, yScale, xAxis, yAxis, line, area;

        var dispatch = d3.dispatch(
            'cursorPosition',
            'cursorRange',
            'fftResult',
            'scaleChanges',
            'setMode'
        );

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
            sampleRateCalc();
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
                if (chartMode.zoom || chartMode.zoom_x || chartMode.zoom_y) {
                    redrawZoomSelection();
                }
            }

            // Keep a copy of the scale
            selection.scale = angular.copy(scale);

            // Lock p0 and keep the value
            selection.p0.locked = true;
            selection.p0.x = xScale.invert(d3MouseDown[0]);
            selection.p0.y = yScale.invert(d3MouseDown[1]);

        };

        var mousemove = function () {
            // Index of the data point corresponding to the mouse position
            d3Mouse = d3.mouse(this);

            // Selection locked (update the selection)
            if (selection.p0.locked) {

                selection.p1.x = xScale.invert(d3Mouse[0]);
                selection.p1.y = yScale.invert(d3Mouse[1]);

                if (chartMode.stats) {
                    dispatch.cursorRange(
                        {t0: parseFloat(selection.p0.x), t1: parseFloat(selection.p1.x)}
                    );
                }

                if (chartMode.move) {
                    scale.x0 -= (selection.p1.x - selection.p0.x);
                    scale.x1 -= (selection.p1.x - selection.p0.x);
                    scale.y0 -= (selection.p1.y - selection.p0.y);
                    scale.y1 -= (selection.p1.y - selection.p0.y);
                    redraw();
                    dispatch.scaleChanges({ x0: scale.x0, x1: scale.x1 });
                }
            }

            // Dispatch the time position to the controllers
            // The time value us the exact time in a data set
            // When receiving the position from an other chart
            // or remote the time should be adjusted...
            if (chartMode.stats) {
                dispatch.cursorPosition(xScale.invert(d3Mouse[0]));
            } else {
                dispatch.cursorPosition(-1);
            }

            if (chartMode.zoom || chartMode.zoom_x || chartMode.zoom_y) {
                redrawZoomSelection();
            }

            // FFT management
            if (chartMode.stats && fftSamplingRate && !fftLocked) {
                var index = helperService.getDataIndex(data, xScale.invert(d3Mouse[0]));
                computeFftSpectrum(index);
                redrawFftSelection();
            }
        };

        var mouseout = function () {
            // Lock fft result when exiting
            if (fftResult && !fftLocked) {
                fftLocked = true;
            }

            // Indicate that the cursor is out of the chart
            dispatch.cursorPosition(-1);
            redrawLegend();

            // Erase the cross ...
            d3Mouse = null;
            redrawZoomSelection();
        };

        var mouseup = function () {

            var mouseDist = Math.sqrt(Math.pow(d3MouseDown[0] - d3.mouse(this)[0], 2) +
                Math.pow(d3MouseDown[1] - d3.mouse(this)[1], 2));

            // Zoom in
            if ((chartMode.zoom || chartMode.zoom_x || chartMode.zoom_y) &&
                    selection.notNull() && mouseDist >= 2) {

                // Keep the old scale for further use
                chartMode.scales.push(angular.copy(scale));

                if (chartMode.zoom || chartMode.zoom_x) {
                    scale.x0 = Math.min(selection.p0.x, selection.p1.x);
                    scale.x1 = Math.max(selection.p0.x, selection.p1.x);
                }
                if (chartMode.zoom || chartMode.zoom_y) {
                    scale.y0 = Math.min(selection.p0.y, selection.p1.y);
                    scale.y1 = Math.max(selection.p0.y, selection.p1.y);
                }
                selection.reset();
                sampleRateCalc();
                redraw();
                redrawZoomSelection();
                dispatch.scaleChanges({ x0: scale.x0, x1: scale.x1 });
            }

            selection.reset();
        };

        var click = function () {
            if (chartMode.stats && fftResult && d3MouseDown[0] === d3.mouse(this)[0]) {
                fftLocked = !fftLocked;
            }

            var scalesLen = chartMode.scales.length,
                mouseDist = Math.sqrt(Math.pow(d3MouseDown[0] - d3.mouse(this)[0], 2) +
                    Math.pow(d3MouseDown[1] - d3.mouse(this)[1], 2));

            // Zoom out
            if ((chartMode.zoom || chartMode.zoom_x || chartMode.zoom_y) &&
                    !!scalesLen && mouseDist < 2) {

                scale = chartMode.scales.splice(-1, 1)[0];
                sampleRateCalc();
                redraw();
                redrawZoomSelection();
                dispatch.scaleChanges({ x0: scale.x0, x1: scale.x1 });
            }
        };

        var dblclick = function () {

            // Reset stats
            if (chartMode.stats) {
                dispatch.cursorRange({ t0: -1, t1: -1});
            }

            // Reset the zoom scale to the bbox
            if (chartMode.zoom || chartMode.zoom_x || chartMode.zoom_y) {
                scale = helperService.bbox(dataOrig, bbox, defScale, param);
                chartMode.scales = [];
                sampleRateCalc();
                redraw();
                dispatch.scaleChanges({ x0: scale.x0, x1: scale.x1 });
            }
        };

        var ecgMargin = function () {
            // Determine if the trace is the first one or last one
            var count = 0,
                firstEcgTrace = -1,
                lastEcgTrace = -1;
            _.forEach(chartPaths, function(item, idx) {
                if (item.show) {
                    if (firstEcgTrace == -1) { firstEcgTrace = idx; }
                    lastEcgTrace = idx;
                    count++;
                }
            });
            margin.top = firstEcgTrace == coord ? 30 : 8;
            margin.bottom = lastEcgTrace == coord ? 25 : 5;
            height = (ecgHeight - 13 * (count - 1)) / count + margin.top + margin.bottom
                + 5 * (9 - count) / count; // Last term is empirical :-/
        };

        var showPath = function (i) {
            // Always show path if chartPaths is empty...
            return chartPaths.length == 0 || (chartPaths[i] && chartPaths[i].show) || ecg9;
        };

        var redrawLegend = function () {

            if (cursorPosition == -1) {
                svg.select('.legend-group').style('display', 'none');
                return;
            }

            // Index of the data point corresponding to the mouse
            // position from the controller
            var index = helperService.getDataIndex(data, cursorPosition);

            // If no data (index = -1) => return
            if (index < 0 || data.length == 0) {
                return;
            }

            // Build data array to render [t, x0, x1, ...]
            var svgData = [data[0][index][0]];
            // x0, x1, ...
            data.forEach(function (entry) { return svgData.push(entry[index][1]); });

            // Activate the display of the legend
            svg.select('.legend-group').style('display', null);

            // Update/create the sensor values
            svg.select('.legend-group')
                .selectAll('.legend-text')
                  .data(svgData)
                  .attr('x', 10)
                  .attr('y', yTextPosition)
                  .text(legendText)
                .enter().append('text')
                  .classed('legend-text', true)
                  .attr('fill', legendColors);

            // Update/create a line for the time position
            svg.select('.legend-group')
                .selectAll('.legend-lineX')
                  .data([svgData[0]])  // data = [t]
                  .attr('x1', function (d) { return xScale(d); })
                  .attr('x2', function (d) { return xScale(d); })
                  .attr('y2', chartH)
                  .attr('y1', 0)
                .enter().append('line')
                  .classed('legend-lineX', true)
                  .attr({'stroke-width': 1, 'stroke': '#555555'});
        };

        var redrawStatistics = function () {
            if (cursorRange.t0 == -1 && cursorRange.t1 == -1) {
                svg.select('.statistics-group').style('display', 'none');
                return;
            }

            var index0 = helperService.getDataIndex(data, Math.min(cursorRange.t0, cursorRange.t1));
            var index1 = helperService.getDataIndex(data, Math.max(cursorRange.t0, cursorRange.t1));

            if (index0 < 0 || index1 < 0) {
                return;
            }

            // Data set on which we will compute the statistics
            var dataSet = [];
            data.forEach(function (entry) {
                dataSet.push(entry.slice(index0, index1 + 1));
            });
            var dataSetLen = dataSet[0].length;

            // Initialization of the object containing the statistics
            var dataStatistics = { mean: [], sigma: [], area: [], slope: [], r2: [] };
            dataStatistics.delta_t = Math.abs(dataSet[0][Math.max(dataSetLen - 1, 0)][0] - dataSet[0][0][0]);

            // Mean & Standard Deviation calculation (corrected sample standard deviation)
            dataSet.forEach(function (entry) {

                var mean = d3.mean(entry, function (d) {
                    return d[1];
                });
                var variance = d3.sum(entry, function (d) {
                    return (d[1] - mean) * (d[1] - mean);
                }) / (dataSetLen - 1);
                var linearReg = helperService.linearRegression(entry);

                dataStatistics.mean.push(mean);
                dataStatistics.sigma.push(Math.sqrt(variance));
                dataStatistics.area.push(mean * dataStatistics.delta_t);
                dataStatistics.slope.push(linearReg.slope);
                dataStatistics.r2.push(linearReg.r2);
            });

            // Activate the display of the stat
            svg.select('.statistics-group').style('display', null);

            // Build data array to render [∆t, [m0, s0, a0], [m1, s1, a1], ...]
            var svgData = [], i;
            svgData.push(dataStatistics.delta_t);
            for (i = 0; i < data.length; i++) {
                svgData.push([
                    dataStatistics.mean[i], dataStatistics.sigma[i],
                    dataStatistics.area[i], dataStatistics.slope[i], dataStatistics.r2[i]]);
            }

            // Update/create the svg text
            svg.select('.statistics-group')
                .selectAll('.stat-text')
                  .data(svgData)
                  .attr('x', chartW - 370)
                  .attr('y', yTextPosition)
                  .text(statText)
                .enter().append('text')
                  .attr('class', 'stat-text')
                  .attr('fill', legendColors);

            // xScale on the start and end time of the data set
            svgData = [[xScale(dataSet[0][0][0]), xScale(dataSet[0][dataSetLen - 1][0])]];

            // Update/create a svg rectangle
            svg.select('.statistics-group')
                .selectAll('.stat-rect')
                  .data(svgData)
                  .attr('x', function (d) { return Math.min(d[0], d[1]); })
                  .attr('y', 0)
                  .attr('height', chartH)
                  .attr('width', function (d) { return Math.abs(d[0] - d[1]); })
                .enter().append('rect')
                  .attr('class', 'stat-rect')
                  .attr('fill', '#d0b31d')
                  .attr('fill-opacity', 0.1)
                  .attr('clip-path', 'url(#clip-' + chartID + ')');

            // Area under the curve
            var areaContainer = svg.select('.statistics-group')
                .selectAll('.stat-area')
                .data(dataSet)
                .attr('d', area)
                .style('display', function (d, i) {
                    return (!showPath(i) ? 'none' : null);
                });
            areaContainer.enter().append('path')
                  .attr('class', 'stat-area')
                  .attr('fill', pathColors)
                  .attr('fill-opacity', 0.3)
                  .attr('clip-path', 'url(#clip-' + chartID + ')');
            areaContainer.exit().remove();
        };

        var redrawZoomSelection = function () {

            /*
             * Cross
             */
            var cross_x = [],
                cross_y = [],
                crossGroup;

            if ((chartMode.zoom || chartMode.zoom_x) && d3Mouse && !selection.p0.locked) {
                cross_x = [d3Mouse[0]];
            }
            if ((chartMode.zoom || chartMode.zoom_y) && d3Mouse && !selection.p0.locked) {
                cross_y = [d3Mouse[1]];
            }

            crossGroup = svg.select('.zoom-group')
                .selectAll('.zoom-cross-y')
                .data(cross_y)  // data = [y]
                .attr('x1', function (d, i) { return 1; })
                .attr('y1', function (d, i) { return d; })
                .attr('x2', function (d, i) { return chartW; })
                .attr('y2', function (d, i) { return d; });
            crossGroup.enter()
                .append('line')
                .attr('class', 'zoom-cross-y')
                .attr({'stroke-width': 1, 'stroke': '#555555'});
            crossGroup.exit().remove();

            crossGroup = svg.select('.zoom-group')
                .selectAll('.zoom-cross-x')
                .data(cross_x)  // data = [y]
                .attr('x1', function (d, i) { return d; })
                .attr('y1', function (d, i) { return 0; })
                .attr('x2', function (d, i) { return d; })
                .attr('y2', function (d, i) { return chartH; });
            crossGroup.enter()
                .append('line')
                .attr('class', 'zoom-cross-x')
                .attr({'stroke-width': 1, 'stroke': '#555555'});
            crossGroup.exit().remove();


            /*
             * Rectangle
             */
            var zoomData, zoomGroup;

            if (selection.p0.x !== -1 && selection.p1.x !== -1) {
                zoomData = [{}];
                if (chartMode.zoom_y) {
                    zoomData[0].x0 = scale.x0;
                    zoomData[0].x1 = scale.x1;
                } else {
                    zoomData[0].x0 = selection.p0.x < selection.p1.x ? selection.p0.x : selection.p1.x;
                    zoomData[0].x1 = selection.p0.x < selection.p1.x ? selection.p1.x : selection.p0.x;
                }
                if (chartMode.zoom_x) {
                    zoomData[0].y0 = scale.y0;
                    zoomData[0].y1 = scale.y1;
                } else {
                    zoomData[0].y0 = selection.p0.y < selection.p1.y ? selection.p0.y : selection.p1.y;
                    zoomData[0].y1 = selection.p0.y < selection.p1.y ? selection.p1.y : selection.p0.y;
                }
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

        // Build Y position:
        var yTextPosition = function (d, i) {
            var yPosition = -10, n;
            for (n = 1; n <= i; n++) {
                if (showPath(n - 1)) {
                    yPosition += 13;
                }
            }
            return yPosition;
        };

        var legendText = function (d, i) {
            if (i == 0) {
                return 't: ' + d.toFixed(5) + ' s';
            }
            if (!showPath(i - 1)) {
                return '';
            }
            var idx = ecg9 ? coord : i - 1,
                legend = param.legends ? (' ' + param.legends[idx]) : ('x' + i),
                unit = param.units ? (' ' +  param.units[idx]) : '';

            return legend + ': ' + d.toFixed(2) + unit;
        };

        var statText = function (d, i) {
            if (i == 0) {
                return '∆t: ' + d.toFixed(5) + ' s';
            }
            if (!showPath(i - 1)) {
                return '';
            }
            var space = param.units ? ' ' : '',
                unit = param.units ? (param.units[i - 1]) : '',
                areaUnit = configService.getAreaUnit(unit),
                slopeUnit = configService.getSlopeUnit(unit);

            return 'μ: ' + d[0].toFixed(2) + space + unit
               + ' — σ: ' + d[1].toPrecision(2) + space + unit
               + ' — a: ' + d[2].toFixed(2) + space + areaUnit
               + ' — s: ' + d[3].toFixed(2) + space + slopeUnit
               + ' (r²: ' + d[4].toFixed(2) + ')';
        };

        var legendColors = function (d, i) {
            if (i === 0) {
                return '#444444';
            }
            return pathColors(d, i - 1);
        };

        var pathColors = function (d, i) {
            if (param.pathColors) {
                if (ecg9) {
                    return param.pathColors[coord];
                }
                return param.pathColors[i];
            }
            return configService.getDefaultColor(i);
        };

        var sampleRateCalc = function (dataFrequency) {
            if (dataFrequency) {
                frequency = dataFrequency;
            }
            samplingRate = Math.max(1, Math.ceil(frequency * (scale.x1 - scale.x0) / chartW));
        };

        var showHidePaths = function () {
            if (!chartPaths || ecg9) {
                return;
            }
            chartPaths.forEach(function (path, idx) {
                svg.select('.chart-group').selectAll('.x' + idx)
                    .style('display', (chartPaths[idx].show ? null : 'none'));
            });
        };

        var smoothingPath = function (newSidePoints) {
            if (!data.length ||
                    newSidePoints === null ||
                    newSidePoints === sidePoints) {
                return;
            }

            if (sidePoints !== 0 && newSidePoints === 0) {
                sidePoints = 0;
                helperService.copyData(dataOrig, data);
            }

            if (newSidePoints !== 0) {
                sidePoints = newSidePoints;
                helperService.smoothData(dataOrig, data, sidePoints);
            }

            // Data rebinding !!!!
            var paths = svg.select('.chart-group')
                .selectAll('.paths')
                .data(data);
        };

        var computeFftSpectrum = function (index) {

            if (fftSamplingRate === null) {
                fftResult = null;
            } else if (index || (fftResult && fftResult.index)) {
                fftResult =
                    helperService.computeFFT(data, index || (fftResult && fftResult.index), fftSamplingRate);
            }
        };

        var redrawFftSelection = function () {
            var fftSelection = [];

            if (fftResult !== null) {
                fftSelection = [[
                    xScale(data[0][fftResult.index - fftSamplingRate / 2][0]),
                    xScale(data[0][fftResult.index + fftSamplingRate / 2][0])
                ]];
            }

            var fftRect = svg.select('.fft-group')
                .selectAll('.fft-rect')
                .data(fftSelection);
            fftRect.enter().append('rect')
                .classed('fft-rect', true)
                .attr('fill', 'grey')
                .attr('fill-opacity', 0.2)
                .attr('clip-path', 'url(#clip-' + chartID + ')');
            fftRect
                .attr('x', function (d) { return d[0]; })
                .attr('y', 0)
                .attr('height', chartH)
                .attr('width', function (d) { return (d[1] - d[0]); });
            fftRect.exit().remove();

            dispatch.fftResult(fftResult);
        };

        var redrawPaths = function () {
            svg.select('.chart-group')
                .selectAll('.paths')
                .attr('d', line)
                .attr('fill', samplingRate > minScalingRate ? pathColors : 'none');
        };

        var redraw = function () {

            chartW = width - margin.left - margin.right;
            chartH = height - margin.top - margin.bottom;

            xScale.domain([scale.x0, scale.x1]).range([0, chartW]);
            yScale.domain([scale.y0, scale.y1]).range([chartH, 0]);

            yAxis.tickSize(-chartW, 5);
            if (height < 100) { yAxis.ticks(5); }

            svg.attr({ width: width, height: height });
            svg.attr({ viewBox: "0 0 " + width + " " + height });
            svg.attr({ preserveAspectRatio: "xMidYMid meet" });

            svg.select('g.container-group')
                .attr({ transform: 'translate(' + margin.left + ',' + margin.top + ')' });

            svg.select('.x-axis-group.axis')
                .attr({ transform: 'translate(0, ' + chartH + ')' })
                .call(xAxis);

            svg.select('.y-axis-group.axis')
                .call(yAxis);

            svg.selectAll('.rect-pane')
                .attr({ width: chartW, height: chartH });

            svg.select('circle.resize')
                .attr({ cx: chartW, cy: chartH });

            // Remove the Y-axis text if multiple scale factors
            if (scaleFactors.length != 1) {
                svg.select('.y-axis-group.axis')
                    .selectAll("text").remove();
            }

            redrawPaths();
            redrawStatistics();
            redrawFftSelection();
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

                container.append('g').classed('x-axis-group axis', true);
                container.append('g').classed('y-axis-group axis', true);

                container.append('g').classed('statistics-group', true);
                container.append('g').classed('legend-group', true);
                container.append('g').classed('zoom-group', true);
                container.append('g').classed('fft-group', true);

                container.append('g').classed('chart-group', true)
                    .attr('clip-path', 'url(#clip-' + chartID + ')');

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
                    .on('mouseup', mouseup)
                    .on('mouseup.resize', resize.mouseup)
                    .on('mousemove.resize', resize.mousemove);

                // Scale
                xScale = d3.scale.linear();
                yScale = d3.scale.linear();

                // Axis
                xAxis = d3.svg.axis().scale(xScale).orient('bottom');
                yAxis = d3.svg.axis().scale(yScale).orient('left').tickPadding(8);


                var d1 = function(d) { return d[1];};

                // Return the y-value in px (used with line & area functions)
                var d3yScale = function(_data, _idx) {
                    var scaleFactor = scaleFactors[_idx % scaleFactors.length];
                    return function (d, i) {
                        if (samplingRate == 1) {
                            return yScale(d[1] * scaleFactor);
                        }
                        return yScale(d3.mean(_data.slice(i, i + samplingRate), d1) * scaleFactor);
                    };
                };

                // Return the y-value max in px (used with line & area functions)
                var d3yScaleMax = function(_data, _idx) {
                    var scaleFactor = scaleFactors[_idx % scaleFactors.length];
                    return function (d, i) {
                        return yScale(d3.max(_data.slice(i, i + samplingRate), d1) * scaleFactor);
                    };
                };

                // Return the y-value min in px (used with line & area functions)
                var d3yScaleMin = function(_data, _idx) {
                    var scaleFactor = scaleFactors[_idx % scaleFactors.length];
                    return function (d, i) {
                        return yScale(d3.min(_data.slice(i, i + samplingRate), d1) * scaleFactor);
                    };
                };

                var d3defined = function (d, i) {
                    return d[0] >= (scale.x0 - 0.01) && d[0] <= scale.x1 && (i % samplingRate) == 0;
                };

                line = function (_data, _idx) {
                    var d3line;
                    if (samplingRate > minScalingRate) {
                        d3line = d3.svg.area()
                            .interpolate('linear')
                            .x(function (d) { return xScale(d[0]); })
                            .y0(d3yScaleMin(_data, _idx))
                            .y1(d3yScaleMax(_data, _idx))
                            .defined(d3defined);
                    } else {
                        d3line = d3.svg.line()
                            .interpolate('linear')
                            .x(function (d) { return xScale(d[0]); })
                            .y(d3yScale(_data, _idx))
                            .defined(d3defined);
                    }
                    return d3line(_data);
                };

                area = function (_data, _idx) {
                    var d3area = d3.svg.area()
                        .interpolate('linear')
                        .x(function (d) { return xScale(d[0]); })
                        .y0(function () { return yScale(0); })
                        .y1(d3yScale(_data, _idx))
                        .defined(d3defined);
                    return d3area(_data);
                };
            }

            redraw();
            redrawLegend();
            showHidePaths();
        }

        // Add or update '.path'
        exports.addData = function (_data, _class, _overlap) {

            // New data on existing data
            if (_data.length && data.length) {

                // Data length
                var dataLength = data[0].length,
                    newDataLength = _data[0].length;

                // Truncate the data array to remove the overlap number of points
                if (dataLength > _overlap) {
                    dataLength -= _overlap;
                    data.forEach(function (entry) { entry.length = dataLength; });
                }

                // Time of the first new data point to add the data array ...
                var startTime = Math.max(data[0][(dataLength - 1)][0], _data[0][0][0]);

                // Compute the index of the new data array that corresponds to the
                // the first new data point
                var index = _data[0].length;
                while (startTime < _data[0][index - 1][0]) { --index; }

                // Add new point in data array
                data.forEach(function (entry, i) {
                    for (var n = index; n < newDataLength; n++) {
                        entry.push(_data[i][n]);
                    }
                });
            }

            // New data on empty chart
            if (_data.length && !data.length) {

                data = _data;
                dataOrig = [];

                // Fast deep  copy...
                data.forEach(function (entry) {
                    var dataTemp = [];
                    entry.forEach(function (entry2) { dataTemp.push([entry2[0], entry2[1]]); });
                    dataOrig.push(dataTemp);
                });
            }

            // Update path with _data
            svg.select('.chart-group')
                .selectAll('.' + _class)
                .data(_data)
               .enter().append('path')
                .attr('stroke-width', 1.5)
                .attr('stroke', pathColors)
                .attr('fill', samplingRate > minScalingRate ? pathColors : 'none')
                .attr('opacity', 0.8)
                .attr('d', line)
                .attr('class', function (d, i) { return _class + ' paths x' + i; })
                .style('display', function (d, i) {
                    return (showPath(i) ? null : 'none');
                });

            // Compute scale to fit Bbox!
            if (_class === 'path0') {
                scale = helperService.bbox(dataOrig, bbox, defScale, param);
            }
        };

        // Remove all '.paths'
        exports.removeData = function () {
            data = [];
            svg.select('.chart-group')
                .selectAll('.paths')
                .remove();

            // Reinitialize the time statistics...
            dispatch.cursorRange({ t0: -1, t1: -1 });
            fftResult = null;
            fftLocked = false;
        };

        exports.truncateData = function (_class, overlap) {
            var dataPath = [];
            svg.select('.chart-group')
                .selectAll('.' + _class)
                .data()
                .forEach(function (entry) {
                    dataPath.push(entry.slice(0, -overlap + 1));
                });

            svg.select('.chart-group')
                .selectAll('.' + _class)
                .data(dataPath)
                .attr('d', line);
        };

        exports.width = function (_x) {
            if (!arguments.length) {
                return width;
            }
            width = _x;

            // Resampling rate
            sampleRateCalc();
            return this;
        };

        exports.height = function (_x) {
            if (!arguments.length) {
                return height;
            }
            height = _x;
            return this;
        };

        exports.bbox = function (_x) {
            if (!arguments.length) {
                return bbox;
            }
            bbox = _x;
            return this;
        };

        exports.showPaths = function (_x) {
            if (!arguments.length) {
                return chartPaths;
            }
            chartPaths = _x;
            if (ecg9) {
                ecgMargin();
                redraw();
            } else {
                redrawLegend();
                redrawStatistics();
                showHidePaths();
            }
            return this;
        };

        exports.shiftTimeScale = function (_x) {
            var diff;
            if (_x > scale.x1) {
                while (_x >= scale.x1) {
                    diff = scale.x1 - scale.x0;
                    scale.x0 += diff;
                    scale.x1 += diff;
                }
                return this;
            }
            if (_x < scale.x0) {
                diff = scale.x0 - _x;
                scale.x0 -= diff;
                scale.x1 -= diff;
                return this;
            }
            return this;
        };

        exports.initScale = function (time) {
            scale.x0 = time || 0;
            scale.x1 = scale.x0 + 10;
            scale.y0 = defScale.y0;
            scale.y1 = defScale.y1;
            return this;
        };

        exports.scale = function (_x) {
            if (!arguments.length) {
                return scale;
            }
            var deltaX = scale.x1 - scale.x0;
            scale.x0 = _x.x0;
            scale.x1 = _x.x1;
            scale.y0 = _x.y0 || scale.y0;
            scale.y1 = _x.y1 || scale.y1;

            // In case of x axis scale change, recompute the sample rate ...
            if (scale.x1 - scale.x0 !== deltaX) {
                sampleRateCalc();
            }
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

        exports.resampling = function (_x) {
            sampleRateCalc(_x);
            return samplingRate;
        };

        exports.fftSampleRate = function (_x) {
            if (!arguments.length) {
                return fftSamplingRate;
            }
            fftSamplingRate = _x;

            if (fftSamplingRate === null) {
                fftLocked = false;
            } else {
                dispatch.setMode('stats');
            }
            computeFftSpectrum();
            redrawFftSelection();
            return this;
        };

        exports.smoothingPath = function (_x) {
            if (!arguments.length) {
                return sidePoints;
            }
            smoothingPath((parseInt(_x, 10) - 1) / 2);
            redrawLegend();
            redrawStatistics();
            redrawPaths();
            computeFftSpectrum();
            redrawFftSelection();
            return this;
        };

        exports.redrawLegend = function (_x) {
            cursorPosition = _x;
            redrawLegend();
            return this;
        };

        exports.redrawStatistics = function (_x) {
            cursorRange = _x;
            redrawStatistics();
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

    return chart;
});

angular.module('IOLabApp').directive('iolabChart', function ($rootScope, $timeout, IOLab, chartService, windowResizeService, helperService, configService, BSON, sharedChartService) {
    'use strict';
    return {
        restrict: 'E',
        replace: true,
        scope: true,
        controller: 'chartCtrl',
        templateUrl: 'components/chart.tpl.html',
        link: function (scope, element) {

            // D3 class object
            var chart = chartService(scope.sensor);

            // html chart element
            var chartElement = d3.select(element[0]);

            // Set height & width
            var chartSize = windowResizeService.getChartSize();
            chart.height(chartSize.height);
            chart.width(chartSize.width);

            // Draw the chart element
            chart(chartElement); // idem chartElement.call(chart);

            var remote = scope.sensor.remote,
                sensorType = scope.sensor.sensorType;

            var timeoutId,
                newData = [],
                overlap = 0,
                startTime = 0,
                previousLastPoint = 0,
                samplingRate = 1,
                computeSamplingRate = true,
                pathNbr = 1;

            // Over lap only for the wheel...
            if (scope.sensor.sensorType === 9) {
                overlap = 8; /*pt*/
            }

            // Used to compute loading time
            var t1, t2, t3;

            function updateChart() {
                if (scope.control.running) {
                    timeoutId = $timeout(function () {
                        IOLab.getSensorData(
                            addDataToChart,
                            { remote: remote, sensor: sensorType, startTime: startTime }
                        );
                    }, 20, false);
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

                // Redraw the preceding path if the new one overlaps
                if (firstPoint < previousLastPoint) {
                    chart.truncateData('path' + pathNbr, overlap);
                }

                // Draw a new path
                chart.addData(newData.data, 'path' + (++pathNbr), overlap);

                // Resampling correction
                var samplingOverlap = Math.max(dataLength - 1 - overlap, 0) % (2 * samplingRate) + 1;
                // Keep the start time for the next data query
                startTime =  newData.data[0][Math.max(dataLength - 1 - overlap - samplingOverlap, 0)][0];
                // Keep the last drawn point for the next step
                previousLastPoint = newData.data[0][Math.max(dataLength - 1 - samplingOverlap, 0)][0];

                updateChart();
            }

            function loadDataToChart(json) {
                newData = json;
                var t2 = new Date();
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
                    IOLab.getSensorData(loadDataToChart, { remote: remote, sensor: sensorType });
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
                IOLab.getSensorData(loadDataToChart, { remote: remote, sensor: sensorType });
            });

            scope.$on('$destroy', function () {
                console.log('*** scope.$on => destroy Chart ***');
                chart.clean();
                chart.on('cursorPosition', null);
                chart.on('cursorRange', null);
                chart.on('fftResult', null);
                chart.on('scaleChanges', null);
                chart.on('setMode', null);
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
                chart.height(chartSize.height);
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
             *  Redraw the fft chart when fftResult is emitted
             */
            chart.on('fftResult', function (data) {
                if (scope.fftResult) {
                    scope.fftResult(data);
                }
            });

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
            scope.$watch('control.fftSampleRate', function () {
                chart.fftSampleRate(scope.control.fftSampleRate);
            });
            scope.$watch('control.legendSettings', function () {
                chartElement.call(chart.showPaths(scope.control.legendSettings));
            }, true);
        }
    };
});

angular.module('IOLabApp').controller('chartCtrl', function ($scope, IOLab, configService, helperService) {
    'use strict';

    var sensorType = $scope.sensor.sensorType,
        config = $scope.sensor.config;

    var sensorParam = configService.getSensor(sensorType);

    $scope.isCollapsed = false;
    $scope.iolabState = IOLab.hardwareState();

    // TODO: return the result for the API (Async call with callback to be implemented)...
    // Possibly an error message => type: 'danger'
    $scope.exportData = function (sensor) {
        var fileName = helperService.getTime() + "_" + sensor.shortDesc;
        IOLab.exportData(sensor.remote, sensor.sensorType, fileName);
        // Broadcast to alert controller
        $scope.$broadcast('alert', { message: fileName, type: 'success' });
    };

    $scope.resetSensorOffset = function (sensor) {
        IOLab.resetSensorOffset(sensor.remote, sensor.sensorType);
    };

    // Drop down zoom modes
    $scope.chartModes = [
        { val: 'stats', glyphicon: 'glyphicon-stats' },
        { val: 'zoom', glyphicon: 'glyphicon-zoom-in' },
        { val: 'zoom_x', glyphicon: 'icon-zoom-x' },
        { val: 'zoom_y', glyphicon: 'icon-zoom-y' },
        { val: 'move', glyphicon: 'glyphicon-move' }
    ];

    // Selected zoom mode
    $scope.chartModeZoom = { value: $scope.chartModes[1] };

    // Drop down time smoothing
    $scope.timeAverages = [1, 3, 5, 7, 9, 11, 13, 15, 25];

    // Drop down FFT
    $scope.fftSampleRates = [
        { value: null, label: '-' },
        { value: 512, label: '512' },
        { value: 1024, label: '1024' },
        { value: 2048, label: '2048' },
        { value: 4096, label: '4096' }
    ];

    // Scope injected in the chart directive and available in the chart view
    $scope.control = {
        dsShow: false,  //used in drop down
        running: $scope.iolabState.dongleMode === 16,
        chartMode: $scope.chartModes[0],
        timeAverage: $scope.timeAverages[sensorParam.timeAverageIdx || 0],
        fftSampleRate: $scope.fftSampleRates[0].value,
        frequency: configService.getSampleRate(sensorType, config),
        legendSettings: configService.getLegendSettings(sensorType),
        exportDataDisabled: IOLab.isNewAcquisition()
    };

    $scope.$on('dataStarted', function () {
        $scope.control.running = true;
    });

    $scope.$on('dataStopped', function () {
        $scope.control.loading = true;
        $scope.control.running = false;
        $scope.control.exportDataDisabled = IOLab.isNewAcquisition();
    });

    // Register fftResult callback
    this.registerFftResult = function (callback) {
        $scope.fftResult = callback;
    };

});
