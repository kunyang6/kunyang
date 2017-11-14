angular.module('IOLabApp').factory('fftService', function (helperService, configService) {
    'use strict';

    var fft = function (_data) {

        var remote = _data.remote,
            config = _data.config,
            sensor = _data.sensorType,
            fftID = remote + '-' + config + '-' + sensor,
            sensorParam = configService.getSensor(sensor) || {};

        // Default width and height (setter/getter)
        var width = 550, height = 120;

        // Default margin
        var margin = { top: 10, right: 20, bottom: 20, left: 30 };

        // Chart paths (used to show/hide paths)
        var chartPaths = [];

        // Variable containing the data to bind. Used also to get the
        // value of t, x1, x2, ... when hovering
        var frequency, samplingRate, spectrums, maxSpectrum;

        // D3 object for the chart rendering
        var svg, chartOrig, chartW, chartH, line, xScale, yScale, xAxis, yAxis;

        //var dispatch = d3.dispatch('cursorPosition', 'cursorRange', 'fftResult');
        var drag = d3.behavior.drag();

        var mousemove = function () {
            redrawLegend();
        };

        var mouseout = function () {
            svg.select('.legend-group').style('display', 'none');
        };

        var zoom = d3.behavior.zoom()
            .on('zoom', function () {
                chartOrig = -1 * d3.event.translate[0];
                redrawFft();
            });

        var showPath = function (i) {
            return chartPaths.length == 0 || (chartPaths[i] && chartPaths[i].show);
        };

        // Build Y position:
        var yTextPosition = function (d, i) {
            var yPosition, n;
            for (yPosition = 0, n = 1; n <= i; n++) {
                if (showPath(n - 1)) {
                    yPosition += 13;
                }
            }
            return yPosition;
        };

        var legendText = function (d, i) {
            if (i === 0) {
                return 'ν: ' + d.toFixed(3) + ' Hz';
            }
            if (!showPath(i - 1)) {
                return '';
            }
            return '|A|: ' + d.toPrecision(3);
        };

        var redrawLegend = function () {
            // Index of the data point corresponding to the mouse
            // position from the controller
            var index = helperService.getDataIndex(
                spectrums,
                xScale.invert(d3.mouse(svg.select('.fft-group').node())[0])
            );

            if (!spectrums) {
                return;
            }

            // Build data array to render [t, x0, x1, ...]
            var svgData = [spectrums[0][index][0]];
            // x0, x1, ...
            spectrums.forEach(function (entry) { return svgData.push(entry[index][1]); });

            // Activate the display of the legend
            svg.select('.legend-group').style('display', null);

            // Update/create the sensor values
            svg.select('.legend-group')
                .selectAll('.legend-text')
                  .data(svgData)
                  .attr('x', 2 * chartW / 3)
                  .attr('y', yTextPosition)
                  .text(legendText)
                .enter().append('text')
                  .classed('legend-text', true)
                  .attr('fill', legendColors);

            // Update/create a line for the time position
            svg.select('.legend-group')
                .selectAll('.legend-line')
                  .data([svgData[0]])  // data = [t]
                  .attr('x1', function (d) { return xScale(d); })
                  .attr('x2', function (d) { return xScale(d); })
                  .attr('y2', chartH)
                  .attr('y1', 0)
                .enter().append('line')
                  .classed('legend-line', true)
                  .attr('stroke-width', 1)
                  .attr('stroke', '#555555');
        };

        var legendColors = function (d, i) {
            if (i === 0) {
                return '#444444';
            }
            return pathColors(d, i - 1);
        };

        var pathColors = function (d, i) {
            if (sensorParam.pathColors) {
                return sensorParam.pathColors[i];
            }
            return configService.getDefaultColor(i);
        };

        var resetSVG = function () {

            svg.attr({ width: 0, height: 0 });
            svg.select('.fft-group')
                .selectAll('.fft-path')
                .data([])
                .exit().remove();
        };

        var initSVG = function () {

            if (samplingRate === null) {
                resetSVG();
                return;
            }

            chartOrig = 0;
            chartW = width - margin.left - margin.right;
            chartH = height - margin.top - margin.bottom;

            svg.attr({ width: width, height: height });

            svg.selectAll('.rect-pane')
                .attr({ width: chartW, height: chartH });

            // Show default scale ..
            var scale = configService.getSampleRate(sensor, config) / samplingRate / 4;

            xScale.domain([0, scale * chartW]).range([0, chartW]);
            yScale.domain([0, 1]).range([chartH, 0]);

            svg.select('.x-axis-group.axis')
                .attr({ transform: 'translate(0, ' + chartH + ')' })
                .call(xAxis);

            svg.select('.y-axis-group.axis')
                .call(yAxis);
        };

        var redrawFft = function () {

            if (samplingRate === null) {
                return;
            }

            var scale = frequency / samplingRate / 4;

            xScale.domain([scale * chartOrig, scale * (chartW + chartOrig)]).range([0, chartW]);
            yScale.domain([0, maxSpectrum]).range([chartH, 0]);

            line.interpolate('step-after')
                .x(function (d) { return xScale(d[0]) - 2; })
                .y(function (d) { return yScale(d[1]); });

            svg.select('.x-axis-group.axis')
                .attr({ transform: 'translate(0, ' + chartH + ')' })
                .call(xAxis);

            svg.select('.y-axis-group.axis')
                .call(yAxis);

            var fftLines = svg
                .select('.fft-group')
                .selectAll('.fft-path')
                .data(spectrums);
            fftLines.enter()
                .append('path')
                .attr('class', 'fft-path')
                .attr('fill', 'none')
                .attr('stroke-width', 1)
                .attr('stroke', pathColors);
            fftLines
                .attr('d', line)
                .style('display', function (d, i) {
                    return (showPath(i) ? null : 'none');
                });
            fftLines.exit().remove();
        };

        function exports(divContainer) {

            if (!svg) {
                svg = divContainer.select('.fft')
                    .append('svg').attr('class', 'fft');

                var container = svg.append('g').classed('container-group', true)
                    .style('-webkit-user-select', 'none')
                    .attr({ transform: 'translate(' + margin.left + ',' + margin.top + ')' });

                container.append('g').classed('x-axis-group axis', true);
                container.append('g').classed('y-axis-group axis', true);
                container.append('g').classed('legend-group', true);

                container.append('g').classed('fft-group', true)
                    .attr('clip-path', 'url(#clip-fft-' + fftID + ')');

                container.append('clipPath').attr('id', 'clip-fft-' + fftID)
                    .append("rect").classed('clip rect-pane', true);

                container.append("rect").classed('overlay rect-pane', true)
                    .attr({ 'fill': 'none', 'pointer-events': 'all' })
                    .on('mousemove', mousemove)
                    .on('mouseout', mouseout)
                    .call(zoom);

                // d3 Scale
                xScale = d3.scale.linear();
                yScale = d3.scale.linear();

                // d3 line
                line = d3.svg.line();

                // d3 Axis
                xAxis = d3.svg.axis().scale(xScale).orient('bottom');
                yAxis = d3.svg.axis().scale(yScale).orient('left');
            }
        }

        // Add or update '.path'
        exports.redraw = function (_data) {
            var maxSpectrums,
                bisect,
                index = 1;

            // Init drawing variables
            if (_data === null) {
                return;
            }

            frequency = _data.frequency;
            spectrums = _data.spectrums;
            samplingRate = _data.samplingRate;

            // Discard bins with frequency < to fftThreshold
            // to compute the max spectrum (max 'y' scale)
            if (sensorParam.fftThreshold) {
                bisect = d3.bisector(function (d) { return d[0]; }).right;
                index = bisect(spectrums[0], sensorParam.fftThreshold);
            }

            // Compute the max value for the spectrum (max 'y' scale)
            maxSpectrums = spectrums.map(function (spectrum, idx) {
                if (!showPath(idx)) {
                    return 0;
                }
                return Math.max.apply(null, spectrum.slice(index).map(function (item) {
                    return item[1];
                }));
            });

            maxSpectrum = Math.max.apply(null, maxSpectrums);

            redrawFft();
        };

        exports.samplingRate = function (_x) {
            if (!arguments.length) {
                return samplingRate;
            }
            samplingRate = _x;
            initSVG();
            return this;
        };

        exports.width = function (_x) {
            if (!arguments.length) {
                return width;
            }
            width = _x;
            initSVG();
            redrawFft();
            return this;
        };

        exports.height = function (_x) {
            if (!arguments.length) {
                return height;
            }
            height = _x / 2;
            initSVG();
            redrawFft();
            return this;
        };

        exports.showPaths = function (_x) {
            if (!arguments.length) {
                return chartPaths;
            }
            chartPaths = _x;
            redrawFft();
            return this;
        };

        //d3.rebind(exports, dispatch, 'on');
        return exports;
    };

    return fft;
});

angular.module('IOLabApp').directive('iolabFft', function (fftService) {
    'use strict';
    return {
        restrict: 'E',
        replace: true,
        require: '^iolabChart',
        templateUrl: 'components/chart-fft.tpl.html',
        link: function (scope, element, attrs, iolabChartCtrl) {

            var fft = fftService(scope.sensor);

            // link the service to the dom element
            fft(d3.select(element[0]));

            // Register fft.redraw callback to update data when they are available
            // in iolab-chart directive
            iolabChartCtrl.registerFftResult(fft.redraw);

            scope.$on('$destroy', function () {
                iolabChartCtrl.registerFftResult(null);
            })

            scope.$watch('control.fftSampleRate', function () {
                fft.samplingRate(scope.control.fftSampleRate);
            });

            scope.$watch('control.legendSettings', function () {
                fft.showPaths(scope.control.legendSettings);
            }, true);
        }
    };
});
