class BitReader {
    #buffer;
    #bitPos = 0;

    constructor(buffer, offset) {
        this.#buffer = buffer;
        this.#bitPos = offset * 8;
    }

    readOneBit() {
        var offset = Math.floor(this.#bitPos / 8),
            shift = 7 - this.#bitPos % 8;
        this.#bitPos += 1;
        return (this.#buffer[offset] >> shift) & 1;
    }

    readBits(n) {
        var i, value = 0;
        for (i = 0; i < n; i += 1) {
            value = value << 1 | this.readOneBit();
        }
        return value;
    }

    skipBits(n) {
        this.#bitPos += n;
    }

    get bitPos() {
        return this.#bitPos;
    }

    get byteLength() {
        return this.#buffer.byteLength
    }

    isEnd() {
        return Math.floor(this.#bitPos / 8) >= this.#buffer.length;
    }
}

class DataReader {
    #offset = 0;
    #view;

    constructor(buffer, start, size) {
        this.#view = new DataView(buffer, start, size);
    }

    get offset() {
        return this.#offset;
    }

    readInt16() {
        let result = this.#view.getInt16(this.#offset);
        this.#offset += 2;
        return result;
    }

    readInt32() {
        let result = this.#view.getInt32(this.#offset);
        this.#offset += 4;
        return result;
    }

    readUint16() {
        let result = this.#view.getUint16(this.#offset);
        this.#offset += 2;
        return result;
    }

    readUint24() {
        return (this.readUint8() << 16) + this.readUint16();
    }

    readUint32() {
        let result = this.#view.getUint32(this.#offset);
        this.#offset += 4;
        return result;
    }

    readUint8() {
        let result = this.#view.getUint8(this.#offset);
        this.#offset += 1;
        return result;
    }

    readUint64() {
        // NOTE: JavaScript can only represent up to 2^53 as precise integer.
        // This calculation may result in incorrect values.
        var upper = this.readUint32();
        var lower = this.readUint32();
        return (upper << 32) + lower;
    }

    readUint8Array(length) {
        let result = new Uint8Array(this.#view.buffer, this.#view.byteOffset + this.#offset, length);
        this.#offset += length;
        return result;
    }

    readString(length) {
        return String.fromCharCode.apply(null, this.readUint8Array(length));
    }

    skip(bytes) {
        this.#offset += bytes;
    }
}

class Atom {
    static minimumSize = 8;

    constructor(parent) {
        Object.defineProperty(this, "is64bit", {
            value: false,
            writable: true,
            enumerable: false,
            configurable: true,
        });
        Object.defineProperty(this, "parent", {
            value: null,
            writable: true,
            enumerable: false,
            configurable: true,
        });
        Object.defineProperty(this, "description", {
            value: "Undifferentiated Atom",
            writable: true,
            enumerable: false,
            configurable: true,
        });

        this.offset = 0;
        this.size = 0;
        this.type = '';
        this.parent = parent;

        return this;
    };

    static create(buffer, offset, parent) {
        // 'offset' is optional.
        if (arguments.length < 2) {
            offset = 0;
        }

        var type = this.getType(buffer, offset);
        var atom;

        if (typeof(Atom.constructorMap[type]) == 'undefined')
            atom = new Atom(parent);
        else
            atom = new Atom.constructorMap[type](parent);
        atom.parse(buffer, offset);
        return atom;
    };

    static getType(buffer, offset) {
        // 'offset' is optional.
        if (arguments.length < 2) {
            offset = 0;
        }

        if (buffer.byteLength - offset < this.minimumSize)
            return null;

        var view = new DataView(buffer, offset, 4);
        var size = view.getUint32(0);
        if (size == 1) {
            view = new DataView(buffer, offset, 12);
            var upper = view.getUint32(4);
            var lower = view.getUint32(8);
            size = (upper << 32)  + lower;
        }

        if (!size || buffer.byteLength < offset + size)
            return null;

        var typeArrayView = new Uint8Array(buffer, offset + 4, 4);
        return String.fromCharCode.apply(null, typeArrayView);
    };


    parse(buffer, offset) {
        // 'offset' is optional.
        if (typeof(offset) == 'undefined')
            offset = 0;

        this.offset = offset;

        if (buffer.byteLength - offset < 8)
            throw 'Buffer not long enough';

        var view = new DataView(buffer, offset, 4);
        var headerOffset = 0;

        this.size = view.getUint32(0);
        headerOffset += 4;

        var typeArrayView = new Uint8Array(buffer, offset + headerOffset, 4);
        this.type = String.fromCharCode.apply(null, typeArrayView);
        headerOffset += 4;

        if (this.size == 1) {
            this.is64bit = true;
            if (buffer.byteLength - offset < 8)
                throw 'Malformed extended size field';

            // NOTE: JavaScript can only represent up to 2^53 as precise integer.
            // This calculation may result in incorrect values.
            view = new DataView(buffer, offset + headerOffset, 8);
            var upper = view.getUint32(0);
            var lower = view.getUint32(4);
            this.size = (upper << 32)  + lower;
            headerOffset += 8;
        }

        if (this.type === 'uuid') {
            var extendedTypeArray = new Uint8Array(buffer, offset + headerOffset, 16);
            this.uuid = String.fromCharCode.apply(null, extendedTypeArray);
            headerOffset += 16;
        }

        return headerOffset;
    };

    getAtomByType(type) {
        if (typeof(this.childAtoms) == 'undefined')
            return null;

        // Bredth first
        var result = this.childAtoms.find(function(atom) {
            return atom.type == type;
        });
        if (result)
            return result;

        for (var i = 0; i < this.childAtoms.length; ++i) {
            var atom = this.childAtoms[i].getAtomByType(type);
            if (atom)
                return atom;
        }

        return null;
    };

    getAtomsByType(type) {
        if (typeof(this.childAtoms) == 'undefined')
            return [];

        // Bredth first
        var result = this.childAtoms.filter(function(atom) {
            return atom.type === type;
        });

        this.childAtoms.forEach(function(atom) {
            result = result.concat(atom.getAtomsByType(type));
        });

        return result;
    };

    static constructorMap = { };
};


class FileTypeAtom extends Atom {
    static {
        Atom.constructorMap['ftyp'] = FileTypeAtom.bind(null);
    }

    static minimumSize = 16;

    constructor(parent) {
        super(parent);

        this.description = "File Type Atom";
        this.brand = "";
        this.version = 0;
        this.compatible_brands = [];
    }

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.brand = reader.readString(4)
        this.version = reader.readUint32();

        while (reader.offset < this.size - 4)
            this.compatible_brands.push(reader.readString(4));

        return reader.offset;
    };
};

class ContainerAtom extends Atom {
    static {
        Atom.constructorMap['moov'] = ContainerAtom.bind(null, 'Movie Atom');
        Atom.constructorMap['trak'] = ContainerAtom.bind(null, 'Track Atom');
        Atom.constructorMap['mdia'] = ContainerAtom.bind(null, 'Media Atom');
        Atom.constructorMap['minf'] = ContainerAtom.bind(null, 'Media Info Atom');
        Atom.constructorMap['mvex'] = ContainerAtom.bind(null, 'Movie Extends Atom');
        Atom.constructorMap['sinf'] = ContainerAtom.bind(null, 'Protection Scheme Info Atom');
        Atom.constructorMap['ipro'] = ContainerAtom.bind(null, 'Item Protection Atom');
        Atom.constructorMap['stbl'] = ContainerAtom.bind(null, 'Sample Table Atom');
        Atom.constructorMap['moof'] = ContainerAtom.bind(null, 'Movie Fragment Atom');
        Atom.constructorMap['traf'] = ContainerAtom.bind(null, 'Track Fragment Atom');
        Atom.constructorMap['edts'] = ContainerAtom.bind(null, 'Edit Box');
        Atom.constructorMap['schi'] = ContainerAtom.bind(null, 'Scheme Information Box');
        Atom.constructorMap['dinf'] = ContainerAtom.bind(null, 'Data Information Box');
        Atom.constructorMap['udta'] = ContainerAtom.bind(null, 'User Data Box');
        Atom.constructorMap['fpsd'] = ContainerAtom.bind(null, 'FairPlay Streaming InitData Box');
        Atom.constructorMap['fpsk'] = ContainerAtom.bind(null, 'FairPlay Key Request Box');

    }

    constructor(description, parent) {
        super(parent);
        this.description = description;
        this.childAtoms = [];
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset, this);
        while (headerOffset < this.size) {
            var childAtom = Atom.create(buffer, offset + headerOffset, this);
            if (!childAtom)
                break;
            headerOffset += childAtom.size;
            this.childAtoms.push(childAtom);
        }
        return headerOffset;
    };
};

class FullBox extends Atom {
    constructor(parent) {
        super(parent);
        this.version = 0;
        this.flags = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.version = reader.readUint8();
        this.flags = reader.readUint24();

        return reader.offset;
    };
};

class MovieHeaderAtom extends FullBox {
    static {
        Atom.constructorMap['mvhd'] = MovieHeaderAtom.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = "Movie Header Atom";
        this.creationTime = 0;
        this.modificationTime = 0;
        this.timeScale = 0;
        this.duration = 0;
        this.preferredRate = 0.0;
        this.preferredVolume = 0.0;
        this.movieMatrix = [[]];
        this.previewTime = 0;
        this.posterTime = 0;
        this.selectionTime = 0;
        this.selectionDuration = 0;
        this.nextTrackID = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.creationTime = new Date(reader.readUint32()*1000 + Date.UTC(1904, 0, 1));
        this.modificationTime = new Date(reader.readUint32()*1000 + Date.UTC(1904, 0, 1));
        this.timeScale = reader.readUint32();
        this.duration  = reader.readUint32();
        this.preferredRate = reader.readUint32() / (1 << 16);
        this.preferredVolume = reader.readUint16() / (1 << 8);

        // Reserved
        // Ten bytes reserved for use by Apple. Set to 0.
        reader.skip(10);

        this.movieMatrix = new Array(3);
        // a, b, u:
        this.movieMatrix[0] = new Array(3);
        this.movieMatrix[0][0] = reader.readUint32() / (1 << 16);
        this.movieMatrix[0][1] = reader.readUint32() / (1 << 16);
        this.movieMatrix[0][2] = reader.readUint32() / (1 << 30);

        // c, d, v:
        this.movieMatrix[1] = new Array(3);
        this.movieMatrix[1][0] = reader.readUint32() / (1 << 16);
        this.movieMatrix[1][1] = reader.readUint32() / (1 << 16);
        this.movieMatrix[1][2] = reader.readUint32() / (1 << 30);

        // x, y, w:
        this.movieMatrix[2] = new Array(3);
        this.movieMatrix[2][0] = reader.readUint32() / (1 << 16);
        this.movieMatrix[2][1] = reader.readUint32() / (1 << 16);
        this.movieMatrix[2][2] = reader.readUint32() / (1 << 30);

        this.previewTime = reader.readUint32();
        this.previewDuration = reader.readUint32();
        this.posterTime = reader.readUint32();
        this.selectionTime = reader.readUint32();
        this.selectionDuration = reader.readUint32();
        this.nextTrackID = reader.readUint32();

        return reader.offset;
    };
};


class EditListBox extends FullBox {
    static {
        Atom.constructorMap['elst'] = EditListBox.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = "Edit List Box";
        this.edits = [];
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        var count = reader.readUint32();

        for (var index = 0; index < count; ++index) {
            var segmentDuration = 0;
            var mediaTime = 0;
            if (this.version === 1) {
                segmentDuration = reader.readUint64();
                mediaTime = reader.readUint64()
            } else {
                segmentDuration = reader.readUint32();
                mediaTime = reader.readInt32();
            }

            var mediaRateInteger = reader.readUint16();
            var mediaRateFraction = reader.readUint16();

            this.edits.push([segmentDuration, mediaTime, mediaRateFraction, mediaRateInteger]);
        }

        return reader.offset;
    };
};

class TrackHeaderAtom extends FullBox {
    static {
        Atom.constructorMap['tkhd'] = TrackHeaderAtom.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = "Track Header Atom";
        this.creationTime = 0;
        this.modificationTime = 0;
        this.trackID = 0;
        this.duration = 0;
        this.layer = 0;
        this.alternateGroup = 0;
        this.volume = 0.0;
        this.trackMatrix = [];
        this.width = 0;
        this.height = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.creationTime = new Date(reader.readUint32()*1000 + Date.UTC(1904, 0, 1));
        this.modificationTime = new Date(reader.readUint32()*1000 + Date.UTC(1904, 0, 1));
        this.trackID = reader.readUint32();

        // Reserved
        // A 32-bit integer that is reserved for use by Apple. Set this field to 0.
        reader.skip(4);

        this.duration = reader.readUint32();

        // Reserved
        // An 8-byte value that is reserved for use by Apple. Set this field to 0.
        reader.skip(8);

        this.layer = reader.readUint16();
        this.alternateGroup = reader.readUint16();
        this.volume = reader.readUint16() / (1 << 8);

        // Reserved
        // A 16-bit integer that is reserved for use by Apple. Set this field to 0.
        reader.skip(2);

        this.trackMatrix = new Array(3);
        // a, b, u:
        this.trackMatrix[0] = new Array(3);
        this.trackMatrix[0][0] = reader.readUint32() / (1 << 16);
        this.trackMatrix[0][1] = reader.readUint32() / (1 << 16);
        this.trackMatrix[0][2] = reader.readUint32() / (1 << 30);

        // c, d, v:
        this.trackMatrix[1] = new Array(3);
        this.trackMatrix[1][0] = reader.readUint32() / (1 << 16);
        this.trackMatrix[1][1] = reader.readUint32() / (1 << 16);
        this.trackMatrix[1][2] = reader.readUint32() / (1 << 30);

        // x, y, w:
        this.trackMatrix[2] = new Array(3);
        this.trackMatrix[2][0] = reader.readUint32() / (1 << 16);
        this.trackMatrix[2][1] = reader.readUint32() / (1 << 16);
        this.trackMatrix[2][2] = reader.readUint32() / (1 << 30);

        this.width = reader.readUint32() / (1 << 16);
        this.height = reader.readUint32() / (1 << 16);

        return reader.offset;
    };
};

class MediaHeaderAtom extends FullBox {
    static {
        Atom.constructorMap['mdhd'] = MediaHeaderAtom.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = "Media Header Atom";
        this.creationTime = 0;
        this.modificationTime = 0;
        this.timeScale = 0;
        this.duration = 0;
        this.language = 0;
        this.quality = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.creationTime = new Date(reader.readUint32()*1000 + Date.UTC(1904, 0, 1));
        this.modificationTime = new Date(reader.readUint32()*1000 + Date.UTC(1904, 0, 1));
        this.timeScale = reader.readUint32();
        this.duration = reader.readUint32();
        this.language = reader.readUint16();
        this.quality = reader.readUint16();

        return reader.offset;
    };
};

class VideoMediaHeaderBox extends FullBox {
    static {
        Atom.constructorMap['vmhd'] = VideoMediaHeaderBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = 'Video Media Header Box';
        this.graphicsMode = 0;
        this.opcolor = [0, 0, 0];
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.graphicsMode = reader.readInt16();
        this.opcolor[0] = reader.readInt16();
        this.opcolor[1] = reader.readInt16();
        this.opcolor[2] = reader.readInt16();

        return reader.offset;
    };
}

class SoundMediaHeaderBox extends FullBox {
    static {
        Atom.constructorMap['smhd'] = SoundMediaHeaderBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = 'Sound Media Header Box';
        this.balance = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.balance = reader.readInt16();

        // const unsigned int(16) reserved = 0;
        reader.skip(2);

        return reader.offset;
    };
}

class HandlerReferenceBox extends FullBox {
    static {
        Atom.constructorMap['hdlr'] = HandlerReferenceBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = 'Handler Reference Box';
        this.handlerType = '';
        this.name = '';
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        // unsigned int(32) predefined = 0;
        reader.skip(4);

        this.handlerType = reader.readString(4);

        // unsigned int(32)[3] reserved = 0;
        reader.skip(12);

        var remaining = this.size - reader.offset;
        this.name = reader.readString(remaining);

        return reader.offset;
    };
};

class SyncSampleAtom extends Atom {
    static {
        Atom.constructorMap['stss'] = SyncSampleAtom.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = "Sync Sample Atom";
        this.version = 0;
        this.flags = 0;
        this.entries = 0;
        this.syncSamples = [];
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.version = reader.readUint8();
        this.flags = reader.readUint24();
        this.entries = reader.readUint32();

        this.syncSamples = new Uint32Array(this.entries);
        var i = 0;
        while (reader.offset < this.size) {
            this.syncSamples[i] = reader.readUint32();
            ++i;
        }

        return reader.offset;
    };
};

class TimeToSampleAtom extends FullBox {
    static {
        Atom.constructorMap['stts'] = TimeToSampleAtom.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = "Time-to-Sample Atom";
        this.entries = 0;

        Object.defineProperty(this, "timeToSamples", {
            value: null,
            writable: true,
            enumerable: false,
            configurable: true,
        });
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.entries = reader.readUint32();

        this.timeToSamples = new Array(this.entries);
        var i = 0;

        while (reader.offset < this.size) {
            var sampleCount = reader.readUint32();
            var sampleDuration = reader.readUint32();

            this.timeToSamples[i] = [sampleCount, sampleDuration];
            ++i;
        }

        return reader.offset;
    };


    timeForIndex(index)
    {
        var sampleSum = 0;
        var timeSum = 0;

        for (var j = 0; j < this.timeToSamples.length; ++j) {
            var samplesWithTime = this.timeToSamples[j][0];
            var sampleLength = this.timeToSamples[j][1];
            var samplesThisPass = Math.min(index - sampleSum, samplesWithTime);
            if (isNaN(samplesWithTime) || isNaN(sampleLength))
                break;

            sampleSum += samplesThisPass;
            timeSum += samplesThisPass * sampleLength;

            if (sampleSum >= index)
                break;
        }

        return timeSum;
    };
};

class SampleSizeAtom extends FullBox {
    static {
        Atom.constructorMap['stsz'] = SampleSizeAtom.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = "Sample Size Atom";
        this.sampleSize = 0;
        this.entries = 0;

        Object.defineProperty(this, "sampleSizes", {
            value: null,
            writable: true,
            enumerable: false,
            configurable: true,
        });
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.sampleSize = reader.readUint32();
        this.entries = reader.readUint32();

        this.sampleSizes = new Uint32Array(this.entries);
        var i = 0;

        while (reader.offset < this.size) {
            this.sampleSizes[i] = reader.readUint32();
            ++i;
        }

        return reader.offset;
    };
};

class SampleDescriptionBox extends FullBox {
    static {
        Atom.constructorMap['stsd'] = SampleDescriptionBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = "Sample Description Box";
        this.childAtoms = [];
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var view = new DataView(buffer, offset);

        if (this.parent.type !== 'stbl' || this.parent.parent.type !== 'minf' || this.parent.parent.parent.type !== 'mdia')
            return;

        var handlerBox = this.parent.parent.parent.getAtomByType('hdlr');
        if (!handlerBox)
            return;

        var entryCount = view.getUint32(headerOffset);
        headerOffset += 4;

        for (var index = 0; index < entryCount; ++index) {
            var entry;
            var type = Atom.getType(buffer, offset + headerOffset);
            if (typeof(Atom.constructorMap[type]) !== 'undefined')
                entry = Atom.create(buffer, offset + headerOffset);
            else {
                switch (handlerBox.handlerType) {
                    case 'soun':
                    entry = new AudioSampleEntry(this);
                    break;
                    case 'vide':
                    entry = new VisualSampleEntry(this);
                    break;
                    case 'hint':
                    entry = new HintSampleDescriptionBox(this);
                    break;
                    case 'meta':
                    entry = new MetadataSampleDescriptionBox(this);
                    break;
                    default:
                    return;
                }
                entry.parse(buffer, offset + headerOffset);
            }
            headerOffset += entry.size;
            this.childAtoms.push(entry);
        }

        return headerOffset;
    };
};

class SampleEntry extends Atom {
    constructor(parent) {
        super(parent);

        this.description = 'Sample Entry';
        this.dataReferenceIndex = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        // unsigned int(8)[6] reserved = 0
        reader.skip(6)

        this.dataReferenceIndex = reader.readUint16();

        return reader.offset;
    }
};

class AudioSampleEntry extends SampleEntry {
    constructor(parent) {
        super(parent);
        this.description = 'Audio Sample Entry';
        this.channelCount = 0;
        this.sampleSize = 0;
        this.sampleRate = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        // unsigned int(32)[2] reserved = 0
        reader.skip(8);

        this.channelCount = reader.readUint16();
        this.sampleSize = reader.readUint16();

        // unsigned int(16) pre_defined = 0
        // const unsigned int(16) reserved = 0
        reader.skip(4);

        this.sampleRate = (reader.readUint32() >> 16) & 0xFFFF;

        return reader.offset;
    };
};

class MP4AudioSampleEntry extends AudioSampleEntry {
    static {
        Atom.constructorMap['mp4a'] = MP4AudioSampleEntry.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = 'MP4 Audio Sample Entry';
        this.childAtoms = [];
    };
    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var ES = new ESDBox(this);
        ES.parse(buffer, offset+ headerOffset);
        this.childAtoms.push(ES);
        headerOffset += ES.size;

        return headerOffset;
    };
};


class EncapsulatedAudioSampleEntry extends AudioSampleEntry {
    static {
        Atom.constructorMap['enca'] = EncapsulatedAudioSampleEntry.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = 'Encapsulated Audio Sample Entry';
        this.childAtoms = [];
    };
    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);

        while (headerOffset < this.size) {
            var childAtom = Atom.create(buffer, offset + headerOffset, this);
            if (!childAtom)
                break;
            headerOffset += childAtom.size;
            this.childAtoms.push(childAtom);
        }

        return headerOffset;
    };
};

class ESDBox extends FullBox {
    static {
        Atom.constructorMap['esds'] = ESDBox.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = 'Sample Description Box'
    }

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);

        this.descriptor = new ESDescriptor(this);
        headerOffset += this.descriptor.parse(buffer, offset + headerOffset);

        return headerOffset;
    }
};

class BaseDescriptor {
    constructor(parent) {
        Object.defineProperty(this, "parent", {
            value: parent,
            writable: true,
            enumerable: false,
            configurable: true,
        });
        Object.defineProperty(this, "description", {
            value: "Abstract Descriptor",
            writable: true,
            enumerable: false,
            configurable: true,
        });

        this.tag = 0;
        this.size = 0;
    };
    parse(buffer, offset) {
        var headerOffset = 0;
        var view = new DataView(buffer, offset);

        this.tag = view.getUint8(headerOffset);
        headerOffset += 1;

        var tagInfo = BaseDescriptor.TagMap[this.tag];
        if (typeof(tagInfo) !== 'undefined')
            this.name = tagInfo.name;

        // BaseDescriptor starts at a size of 2, and can be extended:
        this.size = 2;
        for (var i = 0; i < 4; ++i) {
            var nextSizeByte = view.getUint8(headerOffset);
            headerOffset += 1;

            var msb = nextSizeByte & 0x80;
            var size = nextSizeByte & 0x7f;
            this.size += size;

            if (!msb)
                break;
        }
        return headerOffset;
    };
};

BaseDescriptor.TagMap = {
    3: { name: 'ES_DescrTag' },
    4: { name: 'DecoderConfigDescrTag' },
    5: { name: 'DecSpecificInfoTag' },
};

class ESDescriptor extends BaseDescriptor {
    constructor(parent) {
        super(parent);
        this.description = "ES Descriptor"
        this.ES_ID = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.ES_ID = reader.readUint16();

        var nextByte = reader.readUint8();
        this.streamDependencyFlag = nextByte & (1 << 7);
        this.urlFlag = nextByte & (1 << 6);
        this.ocrStreamFlag = nextByte & (1 << 5);
        this.streamPriority = nextByte & 0x1f;

        if (this.streamDependencyFlag)
            this.dependsOn_ES_Number = reader.readUint16();

        if (this.urlFlag) {
            var urlLength = reader.readUint8();
            this.url = reader.readString(urlLength);
        }

        if (this.ocrStreamFlag)
            this.ocr_ES_ID = reader.readUint16();

        this.decoderConfigDescriptor = new DecoderConfigDescriptor(this);
        headerOffset += this.decoderConfigDescriptor.parse(buffer, offset + reader.offset);

        return reader.offset;
    }
};

class DecoderConfigDescriptor extends BaseDescriptor {
    constructor(parent) {
        super(parent);
        this.description = "Decoder Config Descriptor"
        this.streamType = 0;
        this.objectTypeIndication = 0;
        this.upStream = 0;
        this.specificInfoFlag = 0;
        this.bufferSizeDB = 0;
        this.maxBitrate = 0;
        this.avgBitrate = 0;
        this.specificInfo = [];
    };

    parse(buffer, offset)
    {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.objectTypeIndication = reader.readUint8();

        var nextByte = reader.readUint8();
        this.streamType = (nextByte >> 2) & 0x3f;
        this.upStream = nextByte & 0x2;
        this.specificInfoFlag = nextByte & 0x1;

        var next4Bytes = reader.readUint32();
        this.bufferSizeDB = (next4Bytes >> 8) & 0xFFFFFF

        this.maxBitrate = reader.readUint32();

        this.avgBitrate = reader.readUint32();

        while (this.specificInfoFlag && headerOffset < this.size) {
            var specificInfo = new DecoderSpecificInfo(this);
            specificInfo.parse(buffer, offset + headerOffset)
            reader.skip(specificInfo.size);
            headerOffset += specificInfo.size;

            this.specificInfo.push(specificInfo);
        }

        return reader.offset;
    }
};

class DecoderSpecificInfo extends BaseDescriptor {
    constructor(parent) {
        // 'Audio ISO/IEC 14496-3' && 'AudioStreamType'
        if (parent.objectTypeIndication == 0x40 && parent.streamType == 0x5)
            return new AudioSpecificConfig(parent);

        super(parent);
        this.description = 'Decoder Specific Info';
    }
}

class AudioSpecificConfig extends BaseDescriptor {
    constructor(parent) {
        super(parent);
        this.audioObjectType = 0;
        this.samplingFrequencyIndex = 0;
        this.channelConfiguration = 0;
    }

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
		if (this.size < headerOffset)
			return;

        var array = new Uint8Array(buffer, offset + headerOffset, this.size - headerOffset);
        var bitReader = new BitReader(array, 0);

        this.audioObjectType = bitReader.readBits(5);
        if (this.audioObjectType === 0x1f)
            this.audioObjectType = 32 + bitReader.readBits(6);

        this.samplingFrequencyIndex = bitReader.readBits(4);
        if (this.samplingFrequencyIndex === 0xf)
            this.samplingFrequencyIndex += bitReader.readBits(24);

        return headerOffset;
    }
}

class VisualSampleEntry extends SampleEntry {
    constructor(parent) {
        super(parent);

        this.description = 'Visual Sample Entry';
        this.width = 0;
        this.height = 0;
        this.horizontalResolution = 0;
        this.verticalResolution = 0;
        this.frameCount;
        this.compressorName;
        this.depth;
        this.childAtoms = [];
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        // unsigned int(16) pre_defined = 0
        // const unsigned int(16) reserved = 0
        // unsigned int(32)[3] pre_defined = 0
        reader.skip(16);

        this.width = reader.readUint16();
        this.height = reader.readUint16();
        this.horizontalResolution = reader.readUint32() / (1 << 16);
        this.verticalResolution = reader.readUint32() / (1 << 16);

        // const unsigned int(32) reserved = 0
        reader.skip(4);

        this.frameCount = reader.readUint16();
        this.compressorName = reader.readString(32);
        this.depth = reader.readUint16();

        // int(16) pre_defined = -1;
        reader.skip(2);

        while (this.size - reader.offset > 8) {
            var childAtom = Atom.create(buffer, offset + reader.offset, this);
            if (!childAtom)
                break;
            reader.skip(childAtom.size);
            this.childAtoms.push(childAtom);
        }
        return reader.offset;
    };
};

class AVCConfigurationBox extends Atom {
    static {
        Atom.constructorMap['avcC'] = AVCConfigurationBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = 'AVC Configuration Box';
        this.configurationVersion = 0;
        this.AVCProfileIndication = 0;
        this.profileCompatibility = 0;
        this.AVCLevelIndication = 0;
        this.sequenceParameterSets = [];
        this.pictureParameterSets = [];
    };

    parse(buffer, offset)
    {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.configurationVersion = reader.readUint8();
        this.AVCProfileIndication = reader.readUint8();
        this.profileCompatibility = reader.readUint8();
        this.AVCLevelIndication = reader.readUint8();
        var lengthSizeMinusOne = reader.readUint8() & 0x3;
        var numOfSequenceParameterSets = reader.readUint8() & 0x1f;

        for (var index = 0; index < numOfSequenceParameterSets; ++index) {
            var sequenceParameterSetLength = reader.readUint16();
            this.sequenceParameterSets.push(reader.readUint8Array(sequenceParameterSetLength));
        }

        var numOfPictureParameterSets = reader.readUint8() & 0x1f;

        for (index = 0; index < numOfPictureParameterSets; ++index) {
            var pictureParameterSetLength = reader.readUint16();
            this.pictureParameterSets.push(reader.readUint8Array(pictureParameterSetLength));
        }

        if ([100, 110, 122, 144].indexOf(this.AVCProfileIndication) >= 0) {

            // bit(6) reserved = '111111'b
            this.chromaFormat = reader.readUint8() & 0x3;

            // bit(6) reserved = '111111'b
            this.bitDepthLumaMinus8 = reader.readUint8() & 0x3;

            // bit(5) reserved = '11111'b
            this.bitDepthChromaMinus8 = reader.readUint8() & 0x7;

            if (reader.offset >= this.size)
                return reader.offset;

            var numOfSequenceParameterSetExt = reader.readUint8();
            this.sequenceParameterSets = [];

            for (index = 0; index < numOfSequenceParameterSetExt; ++index) {
                var sequenceParameterSetLength = reader.readUint16();
                this.sequenceParameterSets.push(reader.readUint8Array(sequenceParameterSetLength));
            }
        }

        return reader.offset;
    };
};

class HEVCConfigurationBox extends Atom {
    static {
        Atom.constructorMap['hvcC'] = HEVCConfigurationBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = 'HEVC Configuration Box';
        this.configuration_version = 0;
        this.general_profile_space = 0;
        this.general_tier_flag = 0;
        this.general_profile_idc = 0;
        this.general_profile_compatibility_flags = 0;
        this.general_constraint_indicator_flags = 0;
        this.general_level_idc = 0;
        this.min_spatial_segmentation_idc = 0;
        this.parallelismType = 0;
        this.chromaFormat = 0;
        this.bitDepthLumaMinus8 = 0;
        this.bitDepthChromaMinus8 = 0;
        this.avgFrameRate = 0;
        this.constantFrameRate = 0;
        this.numTemporalLayers = 0;
        this.temporalIdNested = 0;
    };

    parse(buffer, offset)
    {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.configuration_version = reader.readUint8();

        var byte = reader.readUint8();

        this.general_profile_space = (byte & 0x00C0) >> 6;
        this.general_tier_flag = (byte & 0x0020) >> 5;
        this.general_profile_idc = byte & 0x001F;

        this.general_profile_compatibility_flags = reader.readUint32();

        this.general_constraint_indicator_flags = reader.readUint16() << 32

        this.general_level_idc = reader.readUint8();

        // bit(4) reserved = ‘1111’b;
        this.min_spatial_segmentation_idc = reader.readUint16() & 0x0FFF;

        // bit(6) reserved = ‘111111’b;
        this.parallelismType = reader.readUint8() & 0x03;

        // bit(6) reserved = ‘111111’b;
        this.chromaFormat = reader.readUint8() & 0x03;

        // bit(5) reserved = ‘11111’b;
        this.bitDepthLumaMinus8 = reader.readUint8() & 0x07;

        // bit(5) reserved = ‘11111’b;
        this.bitDepthChromaMinus8 = reader.readUint8() & 0x07;

        this.avgFrameRate = reader.readUint16();

        byte = reader.readUint8();

        this.constantFrameRate = (byte & 0xC0) >> 6;
        this.numTemporalLayers = (byte & 0x38) >> 3;
        this.temporalIdNested = (byte & 0x04) >> 2;
        this.lengthSizeMinusOne = byte & 0x02;

        return reader.offset;
    };
};

class CleanApertureBox extends Atom {
    static {
        Atom.constructorMap['clap'] = CleanApertureBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = 'Clean Aperture Box';
        this.cleanApertureWidthN = 0;
        this.cleanApertureWidthD = 0;
        this.cleanApertureHeightN = 0;
        this.cleanApertureHeightD = 0;
        this.horizOffN = 0;
        this.horizOffD = 0;
        this.vertOffN = 0;
        this.vertOffD = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.cleanApertureWidthN = reader.readUint32();
        this.cleanApertureWidthD = reader.readUint32();
        this.cleanApertureHeightN = reader.readUint32();
        this.cleanApertureHeightD = reader.readUint32();
        this.horizOffN = reader.readUint32();
        this.horizOffD = reader.readUint32();
        this.vertOffN = reader.readUint32();
        this.vertOffD = reader.readUint32();
        return reader.offset;
    };
};

class TrackExtendsAtom extends FullBox {
    static {
        Atom.constructorMap['trex'] = TrackExtendsAtom.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = "Track Extends Atom";
        this.trackID = 0;
        this.default_sample_description_index = 0;
        this.default_sample_duration = 0;
        this.default_sample_size = 0;
        this.default_sample_flags = 0;
    }

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.trackID = reader.readUint32();
        this.default_sample_description_index = reader.readUint32();
        this.default_sample_duration = reader.readUint32();
        this.default_sample_size = reader.readUint32();
        this.default_sample_flags = reader.readUint32();
        return reader.offset;
    };
};

class OriginalFormatBox extends Atom {
    static {
        Atom.constructorMap['frma'] = OriginalFormatBox.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = "Original Format Box";
        this.dataFormat = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);

        var array = new Uint8Array(buffer, offset + headerOffset, 4);
        this.dataFormat = String.fromCharCode.apply(null, array);
        headerOffset += 4;

        return headerOffset;
    };
};

class SchemeTypeBox extends FullBox {
    static {
        Atom.constructorMap['schm'] = SchemeTypeBox.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = "Scheme Type Box";
        this.schemeType = 0;
        this.schemeVersion = 0;
        this.schemeURL = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.schemeType = reader.readString(4);
        this.schemeVersion = reader.readUint32();

        if (this.flags & 0x1) {
            var remaining = this.size - reader.offset;
            this.schemeURL = reader.readString(remaining);
        }

        return reader.offset;
    };
};

class TrackEncryptionBox extends FullBox {
    static {
        Atom.constructorMap['tenc'] = TrackEncryptionBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = "Track Encryption Box";
        this.defaultCryptByteBlock = 0;
        this.defaultSkipByteBlock = 0;
        this.defaultIsProtected = 0;
        this.defaultPerSampleIVSize = 0;
        this.defaultKID = '';
        this.defaultConstantIV = null;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        // unsigned int(8)      reserved = 0
        reader.skip(1)

        if (!this.version) {
            // unsigned int(8)  reserved = 0
            reader.skip(1)
        } else {
            let nextByte = reader.readUint8();
            this.defaultCryptByteBlock = (nextByte >> 4) & 0xF;
            this.defaultSkipByteBlock = nextByte & 0xF;
        }

        this.defaultIsProtected = reader.readUint8();
        this.defaultPerSampleIVSize = reader.readUint8();

        var KIDArrayView = reader.readUint8Array(16);
        this.defaultKID = String.prototype.concat.apply("0x", Array.prototype.map.call(KIDArrayView, function(value){ return value.toString(16); }));

        if (this.defaultIsProtected && !this.defaultPerSampleIVSize) {
            var size = reader.readUint8();
            this.defaultConstantIV = reader.readUint8Array(size);
        }

        return reader.offset;
    };
};

class SampleEncryptionBox extends FullBox {
    static {
        Atom.constructorMap['senc'] = SampleEncryptionBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = "Sample Encryption Box";
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        // unsigned int(8)      reserved = 0
        reader.skip(1)

        if (!this.version) {
            // unsigned int(8)  reserved = 0
            reader.skip(1)
        } else {
            let nextByte = reader.readUint8();
            this.defaultCryptByteBlock = (nextByte >> 4) & 0xF;
            this.defaultSkipByteBlock = nextByte & 0xF;
        }

        this.defaultIsProtected = reader.readUint8();
        this.defaultPerSampleIVSize = reader.readUint8();

        var KIDArrayView = reader.readUint8Array(16);
        this.defaultKID = String.prototype.concat.apply("0x", Array.prototype.map.call(KIDArrayView, function(value){ return value.toString(16); }));

        if (this.defaultIsProtected && !this.defaultPerSampleIVSize) {
            var size = reader.readUint8();
            this.defaultConstantIV = reader.readUint8Array(size);
        }

        return reader.offset;
    };
};

class SegmentIndexBox extends FullBox {
    static {
        Atom.constructorMap['sidx'] = SegmentIndexBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = "Segment Index Box";
        this.referenceID = 0;
        this.timeScale = 0;
        this.earliestPresentationTime = 0;
        this.firstOffset = 0;
        this.references = [];
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.referenceID = reader.readUint32();
        this.timeScale = reader.readUint32();

        if (this.version == 1) {
            var upper = reader.readUint32();
            var lower = reader.readUint32();

            this.earliestPresentationTime = (upper << 32)  + lower;

            upper = reader.readUint32();
            lower = reader.readUint32();

            this.firstOffset = (upper << 32)  + lower;
        } else {
            this.earliestPresentationTime = reader.readUint32();

            this.firstOffset = reader.readUint32();
        }

        reader.skip(2); // Reserved uint(16)

        this.referenceCount = reader.readUint16();
        this.references = [];

        for (var i = 0; i < this.referenceCount; ++i) {
            var value = reader.readUint32();

            var reference = {};
            reference.type = (value & 0x80000000) == 0x80000000;
            reference.size = value & ~0x80000000;

            reference.subsegmentDuration = reader.readUint32();

            value = reader.readUint32();

            reference.startsWithSAP = (value & 0x80000000) == 0x80000000;
            reference.SAPType = (value & 0x70000000) >> 28;
            reference.SAPDeltaTime = value & ~0xF0000000;
            this.references.push(reference);
        }

        this.totalDuration = this.references.reduce(function(previousValue, reference) {
            return previousValue + reference.subsegmentDuration;
        }, 0);

        return reader.offset;
    };
};

class ProtectionSystemBox extends FullBox {
    static {
        Atom.constructorMap['pssh'] = ProtectionSystemBox.bind(null);
    }

    constructor(parent) {
        super(parent)
        this.description = "Protection System Box";
        this.systemID = 0;
        this.KIDs = [];
        this.data = null;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var view = new DataView(buffer, offset);

        var UUIDArrayView = new Uint8Array(buffer, offset + headerOffset, 16);
        this.systemID = String.prototype.concat.apply("0x", Array.prototype.map.call(UUIDArrayView, function(value){
            return value.toString(16);
        }));
        headerOffset += 16;

        if (this.version > 0) {
            var kidCount = view.getUint32(headerOffset);
            headerOffset += 4;

            for (var index = 0; index < kidCount; ++index) {
                var KIDArrayView = new Uint8Array(buffer, offset + headerOffset, 16);
                var KIDString = String.prototype.concat.apply("0x", Array.prototype.map.call(KIDArrayView, function(value){ return value.toString(16); }));
                this.KIDs.push(KIDString);
                headerOffset += 16;
            }
        }

        var dataSize = view.getUint32(headerOffset);
        this.data = new Uint8Array(buffer, offset + headerOffset, dataSize);
        headerOffset += dataSize;

        return headerOffset;
    };
};

class MovieExtendsHeaderBox extends FullBox {
    static {
        Atom.constructorMap['mehd'] = MovieExtendsHeaderBox.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = 'Movie Extends Header Box';
        this.duration = 0;
    }

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var view = new DataView(buffer, offset);

        this.duration = view.getUint32(headerOffset);
    }
}


class MovieFragmentHeaderBox extends FullBox {
    static {
        Atom.constructorMap['mfhd'] = MovieFragmentHeaderBox.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = 'Movie Fragment Header Box';
        this.sequenceNumber = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var view = new DataView(buffer, offset);

        this.sequenceNumber = view.getUint32(headerOffset);
        headerOffset += 4;
    };
};

class TrackFragmentHeaderBox extends FullBox {
    static {
        Atom.constructorMap['tfhd'] = TrackFragmentHeaderBox.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = 'Track Fragment Header Box';
        this.baseDataOffsetPresent = false;
        this.sampleDescriptionIndexPresent = false;
        this.defaultSampleDurationPresent = false;
        this.defaultSampleSizePresent = false;
        this.defaultSampleFlagsPresent = false;
        this.durationIsEmpty = false;
        this.defaultBaseIsMoof = false;
        this.trackID = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);

        this.baseDataOffsetPresent         = this.flags & 0x00001 ? true : false;
        this.sampleDescriptionIndexPresent = this.flags & 0x00002 ? true : false;
        this.defaultSampleDurationPresent  = this.flags & 0x00008 ? true : false;
        this.defaultSampleSizePresent      = this.flags & 0x00010 ? true : false;
        this.defaultSampleFlagsPresent     = this.flags & 0x00020 ? true : false;
        this.durationIsEmpty               = this.flags & 0x10000 ? true : false;
        this.defaultBaseIsMoof             = this.flags & 0x20000 ? true : false;

        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.trackID = reader.readUint32();

        if (this.baseDataOffsetPresent)
            this.baseDataOffset = reader.readUint64()

        if (this.sampleDescriptionIndexPresent)
            this.sampleDescriptionIndex = reader.readUint32();

        if (this.defaultSampleDurationPresent)
            this.defaultSampleDuration = reader.readUint32();

        if (this.defaultSampleSizePresent)
            this.defaultSampleSize = reader.readUint32();

        if (this.defaultSampleFlagsPresent)
            this.defaultSampleFlags = reader.readUint32();

        return reader.offset;
    };
};

class TrackFragmentRunBox extends FullBox {
    static {
        Atom.constructorMap['trun'] = TrackFragmentRunBox.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = 'Track Fragment Run Box';
        this.dataOffsetPresent = false;
        this.firstSampleFlagsPresent = false;
        this.sampleDurationPresent = false;
        this.sampleSizePresent = false;
        this.sampleFlagsPresent = false;
        this.sampleCompositionTimeOffsetsPresent = false;
        this.dataOffset;
        this.samples = [];
        this.duration = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        this.dataOffsetPresent                   = this.flags & 0x00001 ? true : false;
        this.firstSampleFlagsPresent             = this.flags & 0x00004 ? true : false;
        this.sampleDurationPresent               = this.flags & 0x00100 ? true : false;
        this.sampleSizePresent                   = this.flags & 0x00200 ? true : false;
        this.sampleFlagsPresent                  = this.flags & 0x00400 ? true : false;
        this.sampleCompositionTimeOffsetsPresent = this.flags & 0x00800 ? true : false;

        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        var sampleCount = reader.readUint32();

        if (this.dataOffsetPresent) {
            this.dataOffset = reader.readUint32();
        }

        if (this.firstSampleFlagsPresent) {
            this.firstSampleFlags = reader.readUint32();
        }

        for (var index = 0; index < sampleCount; ++index) {
            var sample = {}
            if (this.sampleDurationPresent) {
                sample.sampleDuration = reader.readUint32();
                this.duration += sample.sampleDuration;
            }

            if (this.sampleSizePresent) {
                sample.sampleSize = reader.readUint32();
            }

            if (this.sampleFlagsPresent) {
                var sampleFlags = reader.readUint32();
                this.sampleFlags = {
                    isLeading:                 (sampleFlags & 0x0030) >> 4,
                    sampleDependsOn:           (sampleFlags & 0x00C0) >> 6,
                    sampleIsDependedOn:        (sampleFlags & 0x0300) >> 8,
                    sampleHasRedundency:       (sampleFlags & 0x0C00) >> 10,
                    samplePaddingValue:        (sampleFlags & 0x7000) >> 12,
                    sampleIsNonSyncSample:     (sampleFlags & 0x8000) >> 15,
                    sampleDegredationPriority: (sampleFlags & 0xFFFF0000) >> 16,
                }
            }

            if (this.sampleCompositionTimeOffsetsPresent) {
                sample.sampleCompositionTimeOffsets = !this.version ? reader.readUint32() : reader.readInt32();
            }
            this.samples.push(sample);
        }

        return reader.offset;
    };
};

class TrackFragmentBaseMediaDecodeTimeBox extends FullBox {
    static {
        Atom.constructorMap['tfdt'] = TrackFragmentBaseMediaDecodeTimeBox.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = "Track Fragment Decode Time";
        this.baseMediaDecodeTime = 0;
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        if (this.version === 1) {
            var upper = reader.readUint32();
            var lower = reader.readUint32();
            var sign = 1;
            if (upper & (1 << 32)) {
                sign = -1
                upper = ~upper;
                lower = ~lower + 1;
            }

            this.baseMediaDecodeTime = sign * ((upper << 32)  + lower);
        } else {
            this.baseMediaDecodeTime = reader.readUint32();
        }

        return reader.offset;
    };
};

class ColorBox extends Atom {
    static {
        Atom.constructorMap['colr'] = ColorBox.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = "Color";
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.colorType = reader.readString(4);

        if (this.colorType == 'nclx') {
            this.colorPrimaries = reader.readUint16();
            this.transferCharacteristics = reader.readUint16();
            this.matrixCoefficients = reader.readUint16();
            this.fullRangeFlag = (reader.readUint8() & 0x80) === 0x80;
        }

        return reader.offset;
    }
}

class DataEntryBox extends FullBox {
    static {
        Atom.constructorMap['url '] = DataEntryBox.bind(null, "Data Entry URL Box");
        Atom.constructorMap['urn '] = DataEntryBox.bind(null, "Data Entry URN Box");
    }

    constructor(parent, description) {
        super(parent);
        this.description = description;
        this.location = '';
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);

        let remaining = this.size - headerOffset;
        var array = new Uint8Array(buffer, offset + headerOffset, remaining);

        if (this.type === 'url ')
            this.location = String.fromCharCode.apply(null, array);
        else {
            this.name = String.fromCharCode.apply(null, array);

            let nullIndex = array.indexOf(0);
            if (nullIndex != -1) {
                array = new Uint8Array(buffer, offset + headerOffset + nullIndex + 1, remaining - nullIndex - 1)
                this.location = String.fromCharCode.apply(null, array);
            }
        }

        return headerOffset + remaining;
    }
}

class DataReferenceBox extends FullBox {
    static {
        Atom.constructorMap['dref'] = DataReferenceBox.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = "Data Reference Box";
        this.entryCount = 0;
        this.dataEntries = [];
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var view = new DataView(buffer, offset);

        this.entryCount = view.getInt32(headerOffset);
        headerOffset += 4;

        while (this.dataEntries.length < this.entryCount) {
            var childAtom = Atom.create(buffer, offset + headerOffset, this);
            if (!childAtom)
                break;
            headerOffset += childAtom.size;
            this.dataEntries.push(childAtom);
        }

        return headerOffset;
    }
}

class SampleToChunkBox extends FullBox {
    static {
        Atom.constructorMap['stsc'] = SampleToChunkBox.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = "Sample to Chunk Box";
        this.entryCount = 0;

        Object.defineProperty(this, "dataEntries", {
            value: null,
            writable: true,
            enumerable: false,
            configurable: true,
        });
        this.dataEntries = [];
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.entryCount = reader.readUint32();

        while (this.dataEntries.length < this.entryCount) {
            let entry = {
                firstChunk: reader.readUint32(),
                samplesPerChunk: reader.readUint32(),
                sampleDescriptionIndex: reader.readUint32(),
            };
            this.dataEntries.push(entry);
        }

        return reader.offset;
    }
}

class ChunkOffsetBox extends FullBox {
    static {
        Atom.constructorMap['stco'] = ChunkOffsetBox.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = "Chunk Offset Box";
        this.entryCount = 0;

        Object.defineProperty(this, "chunkOffsets", {
            value: null,
            writable: true,
            enumerable: false,
            configurable: true,
        });
        this.chunkOffsets = [];
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.entryCount = reader.readUint32();

        while (this.chunkOffsets.length < this.entryCount)
            this.chunkOffsets.push(reader.readUint32());

        return reader.offset;
    }
}

class SampleDependencyTypeBox extends FullBox {
    static {
        Atom.constructorMap['sdtp'] = SampleDependencyTypeBox.bind(null);
    }

    constructor(parent) {
        super(parent);
        this.description = "Independent and Disposable Samples Box";
        this.entryCount = 0;

        Object.defineProperty(this, "sampleDependencies", {
            value: null,
            writable: true,
            enumerable: false,
            configurable: true,
        });
        this.sampleDependencies = [];
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var array = new Uint8Array(buffer, offset + headerOffset, this.size - headerOffset);
        var bitReader = new BitReader(array, 0);

        while (!bitReader.isEnd()) {
            this.sampleDependencies.push({
                isLeading: bitReader.readBits(2),
                sampleDependsOn: bitReader.readBits(2),
                sampleIsDependedOn: bitReader.readBits(2),
                sampleHasRedundency: bitReader.readBits(2),
            });
        }

        this.entryCount = this.sampleDependencies.length;

        return this.size;
    }
}

class PartialSyncSampleAtom extends FullBox {
    static {
        Atom.constructorMap['stps'] = PartialSyncSampleAtom.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = "Partial Sync Sample Atom";
        this.version = 0;
        this.flags = 0;
        this.entryCount = 0;
        this.partialSyncSamples = [];
    };

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.entryCount = reader.readUint32();

        this.partialSyncSamples = new Uint32Array(this.entryCount);
        var i = 0;
        while (reader.offset < this.size) {
            this.partialSyncSamples[i] = reader.readUint32();
            ++i;
        }

        return reader.offset;
    };
};

class WindowLocationAtom extends Atom {
    static {
        Atom.constructorMap['WLOC'] = WindowLocationAtom.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = "Window Location Atom";
        this.x = 0;
        this.y = 0;
    }

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.x = reader.readInt16();
        this.y = reader.readInt16();

        return reader.offset;
    }
}

class FpsKeySystemInfoBox extends FullBox {
    static {
        Atom.constructorMap['fpsi'] = FpsKeySystemInfoBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = "FairPlay InitData Info Box";
        this.scheme = 0;
    }

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.scheme = reader.readUint32();

        return reader.offset;
    }
}


class FpsKeyRequestInfoBox extends FullBox {
    static {
        Atom.constructorMap['fkri'] = FpsKeyRequestInfoBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = 'FairPlay Key Request Info Box';
        this.keyId = null;
    }

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.keyId = new Uint8Array(buffer, offset + headerOffset, 16);
    }
}

class FpsKeyAssetIdBox extends Atom {
    static {
        Atom.constructorMap['fkai'] = FpsKeyAssetIdBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = 'FairPlay Key Request Asset Id Box';
        this.assetId = null;
    }

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        this.assetId = new Uint8Array(buffer, offset + headerOffset, 16);
    }
}


class FpsKeyContextBox extends Atom {
    static {
        Atom.constructorMap['fkcx'] = FpsKeyContextBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = 'FairPlay Key Request Context Box';
        this.context = null;
    }

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        let dataSize = this.size - headerOffset;
        this.context = new Uint8Array(buffer, offset + headerOffset, dataSize);
    }
}

// optional Version List
class FpsKeyVersionListBox extends Atom {
    static {
        Atom.constructorMap['fkvl'] = FpsKeyVersionListBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = 'FairPlay Key Request Version List Box';
        this.versions = null;
    }

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        let dataSize = this.size - headerOffset;
        this.versions = new Uint32Array(buffer, offset + headerOffset, dataSize / 4);
    }
}

class MetaBox extends FullBox {
    static {
        Atom.constructorMap['meta'] = MetaBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = 'Metadata Box';
        this.childAtoms = [];
    }

    parse (buffer, offset) {
        var headerOffset = super.parse(buffer, offset, this);
        while (headerOffset < this.size) {
            var childAtom = Atom.create(buffer, offset + headerOffset, this);
            if (!childAtom)
                break;
            headerOffset += childAtom.size;
            this.childAtoms.push(childAtom);
        }
        return headerOffset;
    }
}
