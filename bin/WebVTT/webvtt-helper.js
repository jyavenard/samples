function addNextPreviousButtons(video) {
	let wrapper = document.createElement('div');
	wrapper.style.display = 'inline-block';
	wrapper.className = 'video-wrapper'
	video.insertAdjacentElement('afterend', wrapper);
	wrapper.appendChild(video);
	let container = document.createElement('div');
	wrapper.appendChild(container);
	let prev = container.appendChild(document.createElement('button'));
	prev.innerText = 'prev';
	let next = container.appendChild(document.createElement('button'));
	next.innerText = 'next';
	video.insertAdjacentElement('afterend', container);

	function seekToNextCue() {
		let cues =  Array.from(video.textTracks[0].cues)
			.sort((a, b) => a.startTime > b.startTime);
		let nextCue = cues.find(cue => cue.startTime > video.currentTime);
		if (nextCue)
			video.currentTime = nextCue.startTime + (nextCue.endTime - nextCue.startTime) / 2;
	}

	function seekToPreviousCue() {
		let cues = Array.from(video.textTracks[0].cues)
			.sort((a, b) => a.endTime < b.endTime);
		let prevCue = cues.find(cue => cue.endTime < video.currentTime);
		if (prevCue)
			video.currentTime = prevCue.startTime + (prevCue.endTime - prevCue.startTime) / 2;
	}

	function seekToFirstCue() {
		let firstCue = video.textTracks[0].cues[0];
		if (firstCue)
			video.currentTime = firstCue.startTime + (firstCue.endTime - firstCue.startTime) / 2;
	}

	next.addEventListener('click', seekToNextCue);
	prev.addEventListener('click', seekToPreviousCue);

	let track = video.querySelector('track[kind="captions"');
	if (track.readyState == HTMLTrackElement.LOADED)
		seekToFirstCue();
	else
		track.addEventListener('load', seekToFirstCue);
}