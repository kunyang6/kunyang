angular.module('IOLabApp').service('configService', function () {
    'use strict';

    var self = this;

    var colorRed = '#BB0000';
    var colorBlue = '#0000BB';
    var colorGreen = '#008800';

    var colorEcg = ['#819263', '#3ca13b', '#546f6f', '#342fdd', '#49a6ff', '#515095', '#c34947', '#fa3430', '#a73431'];

    var dongleModes = {};
    dongleModes[1] = {desc: 'IDLE'};
    dongleModes[2] = {desc: 'PAIRING'};
    dongleModes[4] = {desc: 'PAIRED'};
    dongleModes[8] = {desc: 'CONNECTED'};
    dongleModes[16] = {desc: 'DATA'};

    var sensors = {};
    sensors[1] = { code: 1, desc: 'Accelerometer', shortDesc: 'Accel',
        pathColors: [colorRed, colorBlue, colorGreen ],
        scales: [-20, 20],
        legends: ['Ax', 'Ay', 'Az'],
        units: ['m/s²', 'm/s²', 'm/s²'],
        minScalingRate: 5
    };

    sensors[2] = { code: 2, desc: 'Magnetometer', shortDesc: 'Magn',
        pathColors: [colorRed, colorBlue, colorGreen ],
        scales: [-150, 150],
        legends: ['Bx', 'By', 'Bz'],
        units: ['µT', 'µT', 'µT'],
        minScalingRate: 5
    };

    sensors[3] = { code: 3, desc: 'Gyroscope', shortDesc: 'Gyro',
        pathColors: [colorRed, colorBlue, colorGreen ],
        scales: [-20, 20],
        legends: ['Ωx', 'Ωy', 'Ωz'],
        units: ['rad/s', 'rad/s', 'rad/s'],
        minScalingRate: 5
    };

    sensors[4] = { code: 4, desc: 'Barometer', shortDesc: 'Baro',
        scales: [0, 120],
        legends: ['Pressure'],
        units: ['kPa'],
        fixedScaleY: true
    };

    sensors[6] = { code: 6, desc: 'Microphone', shortDesc: 'Micro',
        scales: [0, 10],
        fftThreshold: 25 // Hz
    };

    sensors[7] = { code: 7, desc: 'Light', shortDesc: 'Light',
        scales: [0, 10]
    };

    sensors[8] = { code: 8, desc: 'Force', shortDesc: 'Force',
        pathColors: [colorBlue],
        scales: [-5, 5],
        legends: ['Fy'],
        units: ['N']
    };

    sensors[9] = { code: 9, desc: 'Wheel', shortDesc: 'Wheel',
        pathColors: [colorRed, colorGreen, colorBlue],
        scaleFactors: [2, 1.0, 0.2],
        scales: [-5, 5],
        legends: ['Ry', 'Vy', 'Ay'],
        units: ['m', 'm/s', 'm/s²'],
        timeAverageIdx: 2
    };

    sensors[10] = { code: 10, desc: 'Electrocardiogram (3)', shortDesc: 'ECG3', // ECG (requires plugin)
        pathColors: [colorRed, colorBlue, colorGreen],
        legends: ['V1', 'V2', 'V3'],
        units: ['mV', 'mV', 'mV']
    }; // 0x0A

    sensors[11] = { code: 11, desc: 'Battery', shortDesc: 'Bat',
        scales: [0, 4],
        legends: ['Battery'],
        units: ['V'],
        fixedScaleY: true
    }; // 0x0B

    sensors[12] = { code: 12, desc: 'High Gain', shortDesc: 'HG',
        scales: [-1, 1],
        legends: ['Voltage'],
        units: ['mV'],
        fixedScaleY: true
    }; // 0x0C

    sensors[13] = { code: 13, desc: 'Digital', shortDesc: 'Digi',
        scales: [0, 5]
    };        // 0x0D

    sensors[21] = { code: 21, desc: 'Analog 7', shortDesc: 'Ana7',
        scales: [0, 5],
        legends: ['Voltage'],
        units: ['V']
    }; // 0x15

    sensors[22] = { code: 22, desc: 'Analog 8', shortDesc: 'Ana8',
        scales: [0, 5],
        legends: ['Voltage'],
        units: ['V']
    }; // 0x16

    sensors[23] = { code: 23, desc: 'Analog 9', shortDesc: 'Ana9',
        scales: [0, 5],
        legends: ['Voltage'],
        units: ['V']
    }; // 0x17

    sensors[26] = { code: 26, desc: 'Thermometer', shortDesc: 'Therm',
        pathColors: [colorBlue],
        scales: [0, 40],
        legends: ['Temp.'],
        units: ['°C'],
        fixedScaleY: true
    }; // 0x1A

    sensors[241] = { code: 241, desc: 'Electrocardiogram (9)', shortDesc: 'ECG9',
        pathColors: colorEcg,
        legends: ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V3', 'V6'],
        units: ['mV', 'mV', 'mV', 'mV', 'mV', 'mV', 'mV', 'mV', 'mV'],
        timeAverageIdx: 2,
        scales: [-.5,.5],
        minScalingRate: 5
    }; // 0xF1 // Electrocardiogram

    var fixedConfigs = {};
    fixedConfigs[1] = { desc: 'Gyroscope', highSpeed: false,
        sensors: [
            { sensorKey: 3, sampleRate: 380 }
        ]};

    fixedConfigs[2] = { desc: 'Accelerometer', highSpeed: false,
        sensors: [
            { sensorKey: 1, sampleRate: 400 }
        ]};

    fixedConfigs[3] = { desc: 'Orientation', highSpeed: false,
        sensors: [
            { sensorKey: 1, sampleRate: 100 },
            { sensorKey: 2, sampleRate: 80  },
            { sensorKey: 3, sampleRate: 95 },
            { sensorKey: 12, sampleRate: 100}
        ]};

    fixedConfigs[4] = { desc: 'Mini-motion', highSpeed: false,
        sensors:[
            {sensorKey: 1, sampleRate: 200},
            {sensorKey: 9, sampleRate: 100},
            {sensorKey: 8, sampleRate: 200}
        ]};

    fixedConfigs[5] = { desc: 'Pendulum', highSpeed: false,
        sensors: [
            {sensorKey: 1, sampleRate: 100},
            {sensorKey: 3, sampleRate: 95},
            {sensorKey: 8, sampleRate: 100}
        ]};

    fixedConfigs[6] = { desc: 'Ambient', highSpeed: false,
        sensors: [
            {sensorKey: 4, sampleRate: 100},
            {sensorKey: 11, sampleRate: 50},
            {sensorKey: 7, sampleRate: 400},
            {sensorKey: 26, sampleRate: 50}
        ]};

    fixedConfigs[7] = { desc: 'ECG (requires plugin)', highSpeed: false,
        sensors: [
            {sensorKey: 10, sampleRate: 400}
        ]};


    fixedConfigs[8] = { desc: 'Header', highSpeed: false,
        sensors: [
            {sensorKey: 21, sampleRate: 100},
            {sensorKey: 22, sampleRate: 100},
            {sensorKey: 23, sampleRate: 100},
            {sensorKey: 12, sampleRate: 200},
            {sensorKey: 13, sampleRate: 100}
        ]};

    fixedConfigs[9] = { desc: 'Microphone', highSpeed: false,
        sensors: [
            {sensorKey: 6, sampleRate: 2400}
        ]};

    fixedConfigs[10] = { desc: 'Magnetic', highSpeed: false,
        sensors: [
            {sensorKey: 2, sampleRate: 80},
            {sensorKey: 12, sampleRate: 400}
        ]};  // 0x0A

    /* ----------- High speed --------- */
    fixedConfigs[32] = { desc: 'Gyroscope (HS)', highSpeed: true,
        sensors: [
            {sensorKey: 3, sampleRate: 760 }
        ]};              // 0x20

    fixedConfigs[33] = { desc: 'Accelerometer (HS)', highSpeed: true,
        sensors: [
            { sensorKey: 1, sampleRate: 800 }
        ]};         // 0x21

    fixedConfigs[34] = { desc: 'Orientation (HS)', highSpeed: true,
        sensors: [
            {sensorKey: 1, sampleRate: 400},
            {sensorKey: 2, sampleRate: 80},
            {sensorKey: 3, sampleRate: 190} // GPI to check !!!
        ]};           // 0x22

    fixedConfigs[35] = { desc: 'Motion', highSpeed: true,
        sensors: [
            {sensorKey: 1, sampleRate: 200},
            {sensorKey: 3, sampleRate: 190},
            {sensorKey: 9, sampleRate: 100},
            {sensorKey: 8, sampleRate: 200}
        ]};                     // 0x23

    fixedConfigs[36] = { desc: 'Sports', highSpeed: true,
        sensors: [
            {sensorKey: 10, sampleRate: 200},
            {sensorKey: 1, sampleRate: 200},
            {sensorKey: 2, sampleRate: 80},
            {sensorKey: 3, sampleRate: 190}
        ]};                     // 0x24

    fixedConfigs[37] = { desc: 'Pendulum (HS)', highSpeed: true,
        sensors: [
            {sensorKey: 1, sampleRate: 200},
            {sensorKey: 3, sampleRate: 190},
            {sensorKey: 8, sampleRate: 200}
        ]};              // 0x25

    fixedConfigs[38] = { desc: 'Kitchen Sink', highSpeed: true,
        sensors: [
            {sensorKey: 2, sampleRate: 80},
            {sensorKey: 1, sampleRate: 100},
            {sensorKey: 9, sampleRate: 100},
            {sensorKey: 8, sampleRate: 100},
            {sensorKey: 3, sampleRate: 95},
            {sensorKey: 7, sampleRate: 100},
            {sensorKey: 11, sampleRate: 100},
            {sensorKey: 12, sampleRate: 100},
            {sensorKey: 21, sampleRate: 100},
            {sensorKey: 13, sampleRate: 100},
            {sensorKey: 4, sampleRate: 100}
        ]};               // 0x26

    fixedConfigs[39] = { desc: 'Microphone (HS)', highSpeed: true,
        sensors: [
            {sensorKey: 6, sampleRate: 4800}
        ]};            // 0x27

    fixedConfigs[40] = { desc: 'Ambient Light (HS)', highSpeed: true,
        sensors: [
            {sensorKey: 7, sampleRate: 4800}
        ]};         // 0x28

    fixedConfigs[41] = { desc: 'Ambient Light & Accel (HS)', highSpeed: true,
        sensors: [
            {sensorKey: 7, sampleRate: 800},
            {sensorKey: 1, sampleRate: 800}
        ]}; // 0x29

    fixedConfigs[42] = { desc: 'Force Gauge & Accel (HS)', highSpeed: true,
        sensors: [
            {sensorKey: 8, sampleRate: 800},
            {sensorKey: 1, sampleRate: 800}
        ]};   // 0x2A

    fixedConfigs[43] = { desc: 'Ambient Light & Micro (HS)', highSpeed: true,
        sensors: [
            {sensorKey: 7, sampleRate: 2400},
            {sensorKey: 6, sampleRate: 2400}
        ]}; // 0x2B

    fixedConfigs[44] = { desc: 'Electrocardiograph (HS)', highSpeed: true,
        sensors: [
            {sensorKey: 10, sampleRate: 800}
        ]};    // 0x2C

    fixedConfigs[45] = { desc: 'High Gain (HS)', highSpeed: true,
        sensors: [
            {sensorKey: 12, sampleRate: 4800}
        ]};             // 0x2D

    fixedConfigs[46] = { desc: 'Force Gauge (HS)', highSpeed: true,
        sensors: [
            {sensorKey: 8, sampleRate: 4800}
        ]};           // 0x2E

    fixedConfigs[47] = { desc: 'ECG & Analog', highSpeed: true,
        sensors: [
            {sensorKey: 241, sampleRate: 400}
        ]};           // 0xF1


    this.getDefaultColor = function(arg) {
        var defaultColor = [colorRed, colorBlue, colorGreen];
        if (!arguments.length) {
            return defaultColor;
        }
        return defaultColor[arg % 3];
    };

    this.getDongleMode = function (code) { return dongleModes[code]; };
    this.getSensor = function (code) { return sensors[code]; };
    this.getFixedConfig = function (code) { return fixedConfigs[code]; };

    this.getAreaUnit = function (unit) {
        if (!unit) {
            return '';
        }
        switch(unit) {
            case 'm/s': return 'm';
            case 'm/s²': return 'm/s';
            case 'rad/s': return 'rad';
        }
        return unit + 's';
    };

    this.getSlopeUnit = function (unit) {
        if (!unit) {
            return '';
        }
        switch(unit) {
            case 'm/s': return 'm/s²';
            case 'm/s²': return 'm/s³';
            case 'rad/s': return 'rad/s²';
        }
        return unit + '/s';
    };

    /**
     * @param sensorKey, configKey
     * @returns {string}
     */
    this.getSampleRate = function (sensorKey, configKey)  {
        return _.filter(fixedConfigs[configKey].sensors, {sensorKey: sensorKey})[0].sampleRate;
    };

    /**
     *  Sensor array of {code, desc}
     * @returns {Array}
     */
    this.getSensors = function () {
        var sens = [], key;
        for (key in sensors) {
            sens.push({ code: parseInt(key, 10), desc: sensors[key].desc });
        }
        return sens;
    };

    /**
     *  Sensor Config array of {code, configKey, sensorKey, sampleRate}
     *
     * @returns {Array}
     */
    this.getSensorConfigs = function () {
        var sensorConfigs = [], key = 0;
        angular.forEach(fixedConfigs, function(fixedConfig, configKey) {
           angular.forEach(fixedConfig.sensors, function(sensor) {
               sensorConfigs.push({
                   code: key,
                   configKey: parseInt(configKey, 10),
                   highSpeed: fixedConfig.highSpeed,
                   sensorKey: sensor.sensorKey,
                   sampleRate: sensor.sampleRate
               });
               key++;
           });
        });
        return sensorConfigs;
    };

    // Return an array containing objects as {legend: 'a_x (m/s2)', color: '#BB0000'} for each components (eg: x, y, z).
    // This array is be used to show/hide chart lines
    this.getLegendSettings = function (sensorType) {
        var legendSettings = [];
        var sensor = sensors[sensorType];
        if (sensor.legends) {
            sensor.legends.forEach(function (item, idx) {
                legendSettings.push({
                    legend: item + ((sensor.units || [])[idx] ? ' (' + sensor.units[idx] + ')' : ''),
                    color: sensor.pathColors ? sensor.pathColors[idx] : self.getDefaultColor(idx)
                });
            });
        }
        return legendSettings;
    };
});

angular.module('IOLabApp').factory('helperService', function () {
    'use strict';
    var exports = {},
        d0 = function (d) { return d[0]; };

    // Return the index in data array for the input time
    exports.getDataIndex = function (data, time) {

        if (!data || !data.length) {
            return -1;
        }

        var index = d3.bisector(d0).left(data[0], time);

        // Limit cases
        if (index === 0) {
            return index;
        }
        if (index === data[0].length) {
            return index - 1;
        }

        // Find the nearest point
        if (time - data[0][index - 1][0] <= data[0][index][0] - time) {
            return index - 1;
        }
        return index;
    };

    // Format the current date & time as a string: eq "20140219223933"
    exports.getTime = function () {

        var now = new Date(),
            format = function (element) {
                return (element < 10) ? ("0" + element) : element.toString();
            };

        return (now.getFullYear().toString()
            + format(now.getMonth() + 1)
            + format(now.getDate())
            + format(now.getHours())
            + format(now.getMinutes())
            + format(now.getSeconds()));
    };

    // Brut force copy is much more efficient than
    // usual deep object copy
    exports.copyData = function (dataOrig, data) {
        var i, n, len;

        // Total number of data points
        len = dataOrig[0].length;

        for (i = 0; i < data.length; i++) {
            for (n = 0; n < len; n++) {
                data[i][n][1] = dataOrig[i][n][1];
            }
        }
    };

    exports.smoothData = function (dataOrig, data, delta) {
        var i, j, n, len, sum;

        // Total number of data points
        len = dataOrig[0].length;

        for (n = 0; n < dataOrig.length; n++) {
            for (i = 0; i < delta; i++) {
                for (sum = 0, j = 0; j < i + delta + 1; j++) {
                    sum += dataOrig[n][j][1];
                }
                data[n][i][1] = sum / (i + delta + 1);
            }
            for (i = delta; i < len - delta; i++) {
                for (sum = 0, j = i - delta; j < i + delta + 1; j++) {
                    sum += dataOrig[n][j][1];
                }
                data[n][i][1] = sum / (2 * delta + 1);
            }
            for (i = len - delta; i < len; i++) {
                for (sum = 0, j = i - delta; j < len; j++) {
                    sum += dataOrig[n][j][1];
                }
                data[n][i][1] = sum / (len - i + delta);
            }
        }
    };

    exports.computeFFT = function (data, index, bufferSize) {

        var dataLen = data[0].length,
            fftSpectrums = [],
            frequency;

        if (dataLen < bufferSize || bufferSize === null) {
            return null;
        }

        // Force start to 0 or end to bufferSize if the selection
        // is out of the chart
        index = Math.min(index, dataLen - bufferSize / 2 - 1);
        index = Math.max(bufferSize / 2, index);

        // Chart data frequency
        frequency = dataLen / (data[0][dataLen - 1][0] - data[0][0][0]);

        data.forEach(function (pathData) {

            var signal = pathData.slice(index - bufferSize / 2, index + bufferSize / 2)
                .map(function (item) {
                    return item[1];
                });

            var fft = new FFT(bufferSize, frequency);
            fft.forward(signal);

            var fftSpectrum = [];
            angular.forEach(fft.spectrum, function (value, key) {
                fftSpectrum[key] = [frequency * key / bufferSize, value];
            });

            fftSpectrums.push(fftSpectrum);
        });

        return {
            index: index,
            frequency: frequency,
            samplingRate: bufferSize,
            spectrums: fftSpectrums
        };
    };

    exports.linearRegression = function(data) {

            var lr = {};
            var n = data.length;
            var sum_x = 0;
            var sum_y = 0;
            var sum_xy = 0;
            var sum_xx = 0;
            var sum_yy = 0;

            for (var i = 0; i < data.length; i++) {
                sum_x += data[i][0];
                sum_y += data[i][1];
                sum_xy += (data[i][0] * data[i][1]);
                sum_xx += (data[i][0] * data[i][0]);
                sum_yy += (data[i][1] * data[i][1]);
            }

            lr['slope'] = (n * sum_xy - sum_x * sum_y) / (n*sum_xx - sum_x * sum_x);
            lr['intercept'] = (sum_y - lr.slope * sum_x) / n;
            lr['r2'] = Math.pow((n * sum_xy - sum_x * sum_y) / Math.sqrt((n * sum_xx - sum_x * sum_x) * (n * sum_yy - sum_y * sum_y)), 2);

            return lr;
    };

    exports.bbox = function (data, bbox, scale, sensorParams) {

        var len = data[0].length,
            res = {}, deltaY, y0, y1;

        if (len == 0) {
            return scale;
        }

        // x scale ...
        res.x0 = 0;
        res.x1 = data[0][len - 1][0];

        // y scale if not fixed !
        if (!sensorParams.fixedScaleY) {

            var factorScale = sensorParams.scaleFactors || [1];

            y0 = Math.min.apply(Math, bbox.min.map(function (min, idx) {
                var factor = factorScale[idx % factorScale.length];
                return min * factor;
            }));


            y1 = Math.max.apply(Math, bbox.max.map(function (max, idx) {
                var factor = factorScale[idx % factorScale.length];
                return max * factor;
            }));

            deltaY = y1 - y0 || 10;
            res.y0 = y0 - deltaY / 10;
            res.y1 = y1 + deltaY / 10;
        } else {
            res.y0 = scale.y0;
            res.y1 = scale.y1;
        }

        return res;
    };

    return exports;
});

angular.module('IOLabApp').factory('chartModeService', function () {
    'use strict';

    var exports =  function () {

        var chartMode = {
            stats: null,
            move: null,
            zoom: null,
            scales: []
        };

        chartMode.set = function (key) {
            chartMode.stats = false;
            chartMode.move = false;
            chartMode.zoom = false;
            chartMode.zoom_x = false;
            chartMode.zoom_y = false;

            // Set value key of default value
            chartMode[key || 'zoom'] = true;
        };

        chartMode.get = function () {
            Object.keys(chartMode).forEach(function (mode) {
                if (chartMode[mode] === true) {
                    return mode;
                }
            });
        };

        chartMode.set();

        return chartMode;
    };

    return exports;

});

angular.module('IOLabApp').factory('selectionService', function () {
    'use strict';

    var exports = function () {

        var selection = {
            p0: { x: -1, y: -1, index: -1, locked: false },
            p1: { x: -1, y: -1, index: -1, locked: false }
        };

        selection.reset = function () {
            ['p0', 'p1'].forEach(function (key) {
                selection[key].x = -1;
                selection[key].y = -1;
                selection[key].index = -1;
                selection[key].locked = false;
            });
        };

        selection.notNull = function () {
            if (selection.p1.x === -1 || selection.p0.x === -1 ||
                    selection.p1.y === -1 || selection.p0.y === -1) {
                return false;
            }
            return selection.p0.x !== selection.p1.x ||
                selection.p0.y !== selection.p1.y;
        };

        return selection;
    };
    return exports;
});

angular.module('IOLabApp').factory('sharedChartService', function () {
   'use strict';

        var exports = {
            scales: null,
            cursorRange: null,
            cursorPosition: null
        };
        return exports;
});

angular.module('IOLabApp').factory('windowResizeService', function () {
    'use strict';

    var defaultChartHeight = 250,
        defaultParamPlotHeight = 350,
        exports = {};

    exports.getChartSize = function (type) {
        var width = document.getElementById('Remote1Charts').clientWidth * .96,
            height = type === 'ParamPlot' ? defaultParamPlotHeight : defaultChartHeight;
        return {
            width: width,
            height: height
        };
    };

    return exports;
});

// https://github.com/mongodb/js-bson
angular.module('IOLabApp').factory('BSON', function () {
    'use strict';

    var exports = bson().BSON;

    exports.serialize2 = function (object, checkKeys, asBuffer, serializeFunctions) {
        var size = exports.calculateObjectSize(object, serializeFunctions);
        var buffer = new Array(size);
        exports.serializeWithBufferAndIndex(object, checkKeys, buffer, 0, serializeFunctions);
        return buffer;
    };

    return exports;
});
