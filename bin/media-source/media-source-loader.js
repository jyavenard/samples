class MediaSourceLoader {
    #url;
    #prefix;
    #manifest;
    #mediaData;

    constructor(url, prefix) {
        this.#url = url;
        this.#prefix = prefix;
    }

    async load()
    {
        try {
            let fetchResult = await fetch(this.#url);
            let manifest = await fetchResult.json();

            if (manifest && manifest.url) {
                this.#manifest = manifest;
                return this.loadMediaData();
            }
        } catch(e) {
        }
        return Promise.reject("Failed loading manifest");
    }

    async loadMediaData()
    {
        try {
            let url = (this.#prefix ?? '') + this.#manifest.url;
            let fetchResult = await fetch(url);
            let arrayBuffer = await fetchResult.arrayBuffer();
            this.#mediaData = arrayBuffer;
            if (this.onload)
                this.onload();
            return;
        } catch(e) {
        }

        if(this.onerror)
            this.onerror();
        return Promise.reject("Failed loading media data");
    }

    get type()
    {
        return this.#manifest?.type ?? "";
    }

    get duration()
    {
        return this.#manifest?.duration ?? 0
    }

    get initSegmentSize()
    {
        if (!this.#manifest || !this.#manifest.init || !this.#mediaData)
            return null;
        var init = this.#manifest.init;
        return init.size;
    }

    get initSegment()
    {
        if (!this.#manifest || !this.#manifest.init || !this.#mediaData)
            return null;
        var init = this.#manifest.init;
        return this.#mediaData.slice(init.offset, init.offset + init.size);
    }

    get mediaSegmentsLength()
    {
        if (!this.#manifest || !this.#manifest.media)
            return 0;
        return this.#manifest.media.length;   
    }

    mediaSegment(segmentNumber)
    {
        if (!this.#manifest || !this.#manifest.media || !this.#mediaData || segmentNumber >= this.#manifest.media.length)
            return null;
        var media = this.#manifest.media[segmentNumber];
        return this.#mediaData.slice(media.offset, media.offset + media.size);
    }

    mediaSegmentSize(segmentNumber)
    {
        if (!this.#manifest || !this.#manifest.media || !this.#mediaData || segmentNumber >= this.#manifest.media.length)
            return 0;
        var media = this.#manifest.media[segmentNumber];
        return media.size;
    }

    mediaSegmentEndTime(segmentNumber)
    {
        if (!this.#manifest || !this.#manifest.media || !this.#mediaData || segmentNumber >= this.#manifest.media.length)
            return 0;
        var media = this.#manifest.media[segmentNumber];
        return media.timestamp + media.duration;
    }

    concatenateMediaSegments(segmentDataList)
    {
        var totalLength = 0;
        segmentDataList.forEach(segment => totalLength += segment.byteLength);
        var view = new Uint8Array(totalLength);
        var offset = 0;
        segmentDataList.forEach(segment => {
            view.set(new Uint8Array(segment), offset);
            offset += segment.byteLength;
        });
        return view.buffer;
    }
};
