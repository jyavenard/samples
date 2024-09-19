function paintVideoFrame(canvas, options, currentTime) {
    let frameDuration = options.frameDuration;
    let description = options.description;
    let colors = options.colors;
    let audioData = options.audioData;

    let width = canvas.width;
    let height = canvas.height;
    const context = canvas.getContext("2d");

    const radians360 = 2 * Math.PI;
    const northAngle = 1.5 * Math.PI;

    let currentTimeInSeconds = currentTime.value / currentTime.timescale;
    let frameDurationInSeconds = frameDuration.value / frameDuration.timescale;
    let percent = currentTimeInSeconds % 1.0;
    let bip = (currentTimeInSeconds % 2.0) < 1.0;

    let fullRect = { x: 0, y: 0, width: width, height: height };
    let center = { x: width * 3 / 4.0, y: height / 2.0 };

    // Fill frame with background color
    context.fillStyle = colors.background;
    context.fillRect(0, 0, width, height);

    // Dashed line around the outside
    {
        context.save();
        let length = 4;
        context.lineWidth = 1;
        context.setLineDash([length]);
        context.lineCap = "butt";
        context.strokeStyle = colors.foreground;
        context.strokeRect(0.5, 0.5, width - 1, height - 1);
        context.restore();
    }

    // Draw the pi chart
    {
        context.save();
        let startAngle = northAngle;
        let endAngle = northAngle + percent * radians360;

        context.beginPath();
        context.arc(center.x, center.y, height / 4.0, 0, radians360, true);
        context.closePath();
        context.fillStyle = bip ? colors.white : colors.grey;
        context.fill();

        context.beginPath();
        context.moveTo(center.x, center.y);
        context.arc(center.x, center.y, height / 4.0, startAngle, endAngle, true);
        context.lineTo(center.x, center.y);
        context.closePath();

        context.fillStyle = bip ? colors.grey : colors.white;
        context.fill();
        context.restore();
    }

    // Bip/Bop Text
    if (percent < frameDurationInSeconds) {
        context.save();
        context.font = `${height / 6}px "Courier"`;
        let text = bip ? 'Bip!' : 'Bop!';
        let metrics = context.measureText(text);

        let textPosition = { x: center.x - metrics.width / 2, y: center.y};
        context.fillStyle = bip ? colors.grey : colors.white;
        context.textBaseline = 'middle';
        context.fillText(text, textPosition.x, textPosition.y);
        context.restore();
    }

    // Description & Timecode
    {
        context.save();
        context.font = `${height / 24}px "Courier"`;
        let text = description;
        let metrics = context.measureText(text);

        let textPosition = { x: width * 0.05, y: height * 0.05 + metrics.emHeightAscent + metrics.emHeightDescent };

        context.fillStyle = colors.foreground;
        context.fillText(text, textPosition.x, textPosition.y);

        text = `${options.frameDuration.timescale}fps ${width}x${height}`;
        metrics = context.measureText(text);
        textPosition.y += (metrics.emHeightAscent + metrics.emHeightDescent);
        context.fillText(text, textPosition.x, textPosition.y);

        let hours = Math.floor(currentTimeInSeconds / (60 * 60)) % 100;
        let minutes = Math.floor(currentTimeInSeconds / 60) % 60;
        let seconds = Math.floor(currentTimeInSeconds) % 60;
        let rem = frameDuration.value % frameDuration.timescale;
        let dropFrames = rem != 0;
        let frames = Math.round(currentTimeInSeconds % 1.0 / frameDurationInSeconds);
        let totalFrames = currentTime.value / frameDuration.value;

        context.font = `${height / 12}px "Courier"`;
        text = [
            String(hours).padStart(2, '0'), ':',
            String(minutes).padStart(2, '0'), ':',
            String(seconds).padStart(2, '0'),
            dropFrames ? ";" : ".",
            String(frames).padStart(2, '0'),
            ].join('');

        metrics = context.measureText(text);
        textPosition.y += (metrics.emHeightAscent + metrics.emHeightDescent);
        context.fillText(text, textPosition.x, textPosition.y);

        let frameCount = String(totalFrames).padStart(6, '0');

        metrics = context.measureText(text);
        textPosition.y += (metrics.emHeightAscent + metrics.emHeightDescent);
        context.fillText(frameCount, textPosition.x, textPosition.y);

        context.restore();
    }

    {
        context.save();

        // Draw line patterns:
        let length = 1;
        let size = height / 15;
        let halfSize = size / 2;
        context.lineWidth = size;
        context.setLineDash([length]);
        context.lineCap = "butt";
        let startPoint = { 
            x: width * 0.05, 
            y: height > 240 ? height / 2.0 : width * 0.05
        };
        context.strokeStyle = colors.foreground;

        context.beginPath();
        context.moveTo(startPoint.x, startPoint.y - halfSize);
        context.lineTo(startPoint.x + size, startPoint.y - halfSize);
        startPoint.x += size;
        context.moveTo(startPoint.x + halfSize, startPoint.y - size);
        context.lineTo(startPoint.x + halfSize, startPoint.y);
        startPoint.x += size;
        context.moveTo(0, 0);
        context.closePath();
        context.stroke();

        length = 2;
        context.setLineDash([length]);
        context.beginPath();
        context.moveTo(startPoint.x, startPoint.y - halfSize);
        context.lineTo(startPoint.x + size, startPoint.y - halfSize);
        startPoint.x += size;
        context.moveTo(startPoint.x + halfSize, startPoint.y - size);
        context.lineTo(startPoint.x + halfSize, startPoint.y);
        startPoint.x += size;
        context.moveTo(0, 0);
        context.closePath();
        context.stroke();

        startPoint = {
            x: width * 0.05, 
            y: height > 240 ? height / 2.0 : width * 0.05
        };

        [colors.grey, colors.yellow, colors.cyan, colors.green, colors.purple, colors.red, colors.blue].forEach(color => {
            context.fillStyle = color;
            context.fillRect(startPoint.x, startPoint.y, size, size);
            startPoint.x += size;
        });
        context.restore();
    }

    if (audioData) {
        context.save();

        let waveformBounds = { x: 0, y: height * 0.95, width: width, height: height * 0.15 };
        let waveformStart = waveformBounds.x;
        let waveformMidpoint = waveformBounds.y - waveformBounds.height / 2;
        let sampleHeight = waveformBounds.height / 2;
        let sampleWidth = waveformBounds.width / audioData.length;
        const audioDataMax = Math.pow(2,15) - 1;

        context.lineWidth = 1.5;
        context.lineCap = "butt";
        context.strokeStyle = colors.foreground;

        let audioDataToY = (data) => {
            return waveformMidpoint + (data / audioDataMax) * sampleHeight;
        };

        let sampleNumberToX = (sampleNumber) => {
            return waveformStart + sampleNumber * sampleWidth;
        };


        context.beginPath();
        context.moveTo(sampleNumberToX(0), audioDataToY(audioData[0]));
        for (var sampleNumber = 1; sampleNumber < audioData.length; ++sampleNumber) {
            let waveformPoint = { x: sampleNumberToX(sampleNumber), y: audioDataToY(audioData[sampleNumber]) };
            context.lineTo(waveformPoint.x, waveformPoint.y);
        }
        context.stroke();

        context.restore();
    }
}

function writeAudioData(options, inCurrentTime, inEndTime)
{
    const kHumFrequency = 125.0;
    const kHumAmplitude = 0;
    const kBipFrequency = 1500.0;
    const kBipAmplitude = 32768.0;
    const kBopFrequency = 500.0;
    const kBopAmplitude = 32768.0;
    const kPi = 3.141592565;
    const kAudioSampleRate = 48000;
    function convertTimescale(time, newScale) {
        return { value: Math.round(time.value / time.timescale * newScale), timescale: newScale };
    }

    let audioData = options.audioData;
    let startTime = convertTimescale(inCurrentTime, kAudioSampleRate);
    let endTime = convertTimescale(inEndTime, kAudioSampleRate);
    let duration = convertTimescale(options.frameDuration, kAudioSampleRate);

    let frequency = kHumFrequency;
    let amplitude = kHumAmplitude;

    let bipBopPeriod = startTime.timescale * 2;

    let shouldBip = startTime.value % bipBopPeriod == 0;
    let shouldBop = (startTime.value + startTime.timescale) % bipBopPeriod == 0;

    if (shouldBip) {
        frequency = kBipFrequency;
        amplitude = kBipAmplitude;
    } else if (shouldBop) {
        frequency = kBopFrequency;
        amplitude = kBopAmplitude;
    }

    let humPeriod = startTime.timescale / frequency;
    // we want these to stitch together seamlessly, so round the hum period
    // so that it divides into the sample count exactly.
    humPeriod = duration.value / Math.floor( duration.value / humPeriod + 0.5 ); // NB: count / humPeriod is the number of waveforms

    let currentSample = 0;
    for (var sampleNumber = startTime.value; sampleNumber < endTime.value; ++sampleNumber, ++currentSample) {

        audioData[currentSample] = amplitude * Math.sin(sampleNumber * 2 * kPi / humPeriod);
    }
}