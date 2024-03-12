class VideoContainer extends HTMLElement {
    static {
        customElements.define("video-container", VideoContainer);
    }

    static get observedAttributes() {
        return ["src"];
    }
    #video;

    constructor() {
        super();
    }

    async connectedCallback() {
        this.attachShadow({ mode: "open" });
        this.shadowRoot.innerHTML = this.#template;

        this.#video = this.shadowRoot.querySelector('video');
        this.#video.playsInline = this.getAttribute('playsInline') || true;
        this.#video.src = this.getAttribute('src');
        this.#video.load();

        let timeline = this.shadowRoot.querySelector('.timeline');
        let currentTime = this.shadowRoot.querySelector('.current-time');
        let remainingTime = this.shadowRoot.querySelector('.remaining-time');

        function formatTime(value) {
            let sign = Math.sign(value)
            let seconds = Math.trunc(Math.abs(value)) % 60;
            let minutes = Math.trunc(Math.abs(value) / 60);
            return `${ sign === -1 ? '-' : ''}${ minutes.toString().padStart(2, '0') }:${ seconds.toString().padStart(2, '0') }`;
        };

        this.#video.addEventListener('durationchange', event => {
            remainingTime.innerText = formatTime(this.#video.currentTime - this.#video.duration);
            timeline.max = this.#video.duration;
            timeline.value = this.#video.currentTime;
        });

        this.#video.addEventListener('timeupdate', event => {
            currentTime.innerText = formatTime(this.#video.currentTime);
            remainingTime.innerText = formatTime(this.#video.currentTime - this.#video.duration);
            timeline.value = this.#video.currentTime;
        });

        this.shadowRoot.querySelector('.play-pause').addEventListener('click', event => {
            this.#video.paused ? this.#video.play() : this.#video.pause();
        });

        this.shadowRoot.querySelector('.mute').addEventListener('click', event => {
            this.#video.muted = !this.#video.muted;
        });

        timeline.addEventListener('change', event => {
            this.#video.currentTime = timeline.value;
        });

        this.shadowRoot.querySelector('.pip').addEventListener('click', event => {
            if (this.#video.requestPictureInPicture && document.pictureInPictureElement !== this.#video)
                this.#video.requestPictureInPicture();
            else if (document.exitPictureInPicture && document.pictureInPictureElement === this.#video)
                document.exitPictureInPicture();
        });

        this.shadowRoot.querySelector('.fullscreen').addEventListener('click', event => {
            if (this.shadowRoot.host.requestFullscreen && document.fullscreenElement !== this.shadowRoot.host)
                this.shadowRoot.host.requestFullscreen({navigationUI: "hide"});
            else if (document.exitFullscreen && document.fullscreenElement === this.shadowRoot.host)
                document.exitFullscreen();
            else if (this.#video.webkitDisplayingFullscreen)
                this.#video.webkitExitFullscreen();
            else
                this.#video.webkitEnterFullscreen();
        });

        this.shadowRoot.querySelector('.video-controls').addEventListener('click', event => {
            if (this.#video.paused)
                this.#video.play();
            else
                this.#video.pause();
        });

        this.shadowRoot.querySelector('.video-controls-bar').addEventListener('click', event => {
            event.stopPropagation();
        });
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (this.#video) {
            if (name.toLowerCase() === 'src')
                this.#video.src = newValue;
            if (name.toLowerCase() === 'playsinline')
                this.#video.playsInline = newValue;
        }
    }

    addSource(src, type) {
        let sourceElement = this.#video.appendChild(document.createElement('source'));
        sourceElement.src = src;
        if (type)
            sourceElement.type = type;
        this.#video.appendChild(sourceElement);
    }

    #template = `
<link rel="stylesheet" href="video-container.css">
<div id=root>
    <video>
        <slot name="source1"></slot>
    </video>
    <div class=video-controls>
        <div class=video-controls-bar>
            <div class="play-pause button">
                <div class=icon></div>
            </div>
            <div class="mute button">
                <div class=icon></div>
            </div>
            <div class="current-time">00:00</div>
            <input type=range class="timeline" step=0.1 min=0 max=1 value=0>
            <div class="remaining-time">00:00</div>
            <div class="pip button">
                <div class=icon></div>
            </div>
            <div class="fullscreen button">
                <div class=icon></div>
            </div>
        </div>
    </div>
</div>`
}
