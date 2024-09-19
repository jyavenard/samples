importScripts('bip-bop.js');

var options;
var canvas;
var audioData;
var currentTime;
var endTime;

function start() {
}

function stop() {
}

function setOptions(inOptions) {
	options = inOptions;
	paint()
}

function setCanvas(inCanvas) {
	canvas = inCanvas;
	audioData = new Int16Array(canvas.width * 2);
	paint();
}

function setTime(inCurrentTime, inEndTime) {
	currentTime = inCurrentTime;
	endTime = inEndTime;
	paint();
}

function setSize(inWidth, inHeight) {
	canvas.width = inWidth;
	canvas.height = inHeight;
	paint();
}

function paint() {
	if (!options || !canvas || !currentTime || !endTime)
		return;
    writeAudioData(options, currentTime, endTime);
    paintVideoFrame(canvas, options, currentTime);
}

function paintAndIncrement() {
    currentTime.value += 1;
    endTime.value += 1;
    paint();
    if (currentTime.value / currentTime.timescale % options.segmentDuration == 0)
    	postMessage({type: 'segment-duration-reached'});
}

addEventListener("message", event => {
	switch(event.data.type) {
	case 'set-options':
		setOptions(event.data.options);
		break;
	case 'set-canvas':
		setCanvas(event.data.canvas);
		break;
	case 'set-time':
		setTime(event.data.currentTime, event.data.endTime);
		break;
	case 'set-size':
		setSize(event.data.width, event.data.height);
		break;
	case 'start':
		start();
		break;
	case 'stop':
		stop();
		break;
	case 'paint-and-increment':
		paintAndIncrement();
		break;
	}
});
