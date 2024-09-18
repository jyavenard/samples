importScripts('bip-bop.js');

var options;
var canvas;
var audioData;

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

function paint() {
	if (!options || !canvas)
		return;
    writeAudioData(options);
    paintVideoFrame(canvas, options);
}

function paintAndIncrement() {
    options.currentTime.value += 1;
    options.endTime.value += 1;
    paint();
}

addEventListener("message", event => {
	switch(event.data.type) {
	case 'set-options':
		setOptions(event.data.options);
		break;
	case 'set-canvas':
		setCanvas(event.data.canvas);
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
