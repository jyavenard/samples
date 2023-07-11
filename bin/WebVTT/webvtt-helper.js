function addNextPreviousButtons(video) {
	let container = document.createElement('div');
	let prev = container.appendChild(document.createElement('button'));
	prev.innerText = 'prev';
	let next = container.appendChild(document.createElement('button'));
	next.innerText = 'next';
	video.insertAdjacentElement('afterend', container);

	next.addEventListener('click', event => {
		let cues =  Array.from(video.textTracks[0].cues)
			.sort((a, b) => a.startTime > b.startTime);
		let nextCue = cues.find(cue => cue.startTime > video.currentTime);
		if (nextCue)
			video.currentTime = nextCue.startTime + (nextCue.endTime - nextCue.startTime) / 2;
	});

	prev.addEventListener('click', event => {
		let cues = Array.from(video.textTracks[0].cues)
			.sort((a, b) => a.endTime < b.endTime);
		let prevCue = cues.find(cue => cue.endTime < video.currentTime);
		if (prevCue)
			video.currentTime = prevCue.startTime + (prevCue.endTime - prevCue.startTime) / 2;
	});
}