
class AV1CodecConfigurationBox extends Atom {
    static {
        Atom.constructorMap['av1C'] = AV1CodecConfigurationBox.bind(null);
    }

    constructor(parent) {
        super(parent);

        this.description = 'AV1 Codec Configuration Box';

        this.marker = 1;             // unsigned int (1)
        this.version = 1;            // unsigned int (7)
        this.seq_profile;            // unsigned int (3)
        this.seq_level_idx_0;        // unsigned int (5)
        this.seq_tier_0;             // unsigned int (1)
        this.high_bitdepth;          // unsigned int (1)
        this.twelve_bit;             // unsigned int (1)
        this.monochrome;             // unsigned int (1)
        this.chroma_subsampling_x;   // unsigned int (1)
        this.chroma_subsampling_y;   // unsigned int (1)
        this.chroma_sample_position; // unsigned int (2)
        this.initial_presentation_delay_minus_one; // unsigned int (4)
        this.configOBUs = [];
    }

    parse(buffer, offset) {
        var headerOffset = super.parse(buffer, offset);
        var reader = new DataReader(buffer, offset, this.size);
        reader.skip(headerOffset);

        var markerVersionByte = reader.readUint8();
        headerOffset += 1;
        this.marker = (markerVersionByte & 0x80) === 0x80;
        this.version = markerVersionByte & 0x7F;

        var profileLevelByte = reader.readUint8();
        headerOffset += 1;
        this.seq_profile = (profileLevelByte & 0xE0) >> 5;
        this.seq_level_idx_0 = (profileLevelByte & 0x1F);

        var remainingByte = reader.readUint8();
        headerOffset += 1;
        this.seq_tier_0 = (remainingByte & 0x80) === 0x80;
        this.high_bitdepth = (remainingByte & 0x40) === 0x40;
        this.twelve_bit = (remainingByte & 0x20) === 0x20;
        this.monochrome = (remainingByte & 0x10) === 0x10;
        this.chroma_subsampling_x = (remainingByte & 0x8) === 0x8;
        this.chroma_subsampling_y = (remainingByte & 0x4) === 0x4;
        this.chroma_sample_position = remainingByte & 0x3;

        var reservedAndInitialDelayPresentByte = reader.readUint8();
        headerOffset += 1;

        this.initial_presentation_delay_minus_one = reservedAndInitialDelayPresentByte & 0x1;

        while (headerOffset < this.size) {
            let obuBufferStart = offset + headerOffset;
            let remainingSize = this.size - headerOffset;
            var obuBuffer = buffer.slice(obuBufferStart, obuBufferStart + remainingSize);
            let obu = OBU.create(obuBuffer);
            if (!obu.size)
                break;
            headerOffset += obu.size;

            this.configOBUs.push(obu);
        }

        return reader.offset;
    }
}

BitReader.prototype.readLeb128 = function() {
    var value = 0
    for (var i = 0; i < 8; i++) {
        let leb128_byte = this.readBits(8);
        value += ( (leb128_byte & 0x7f) << (i*7))

        if ( (leb128_byte & 0x80) !== 0x80) {
            break;
        }
    }
    return value;
};

BitReader.prototype.uvlc = function() {
    let leadingZeros = 0     

    while ( 1 ) {
        done = this.readOneBit();
        if ( done )  
            break;
        leadingZeros++   
    }    

    if ( leadingZeros >= 32 )
        return ( 1 << 32 ) - 1;

    value = this.readBits(leadingZeros);
    return value + ( 1 << leadingZeros ) - 1;
};

class OBU {
    static TYPES = {
        OBU_SEQUENCE_HEADER: 1,
        OBU_TEMPORAL_DELIMITER: 2,
        OBU_FRAME_HEADER: 3,
        OBU_TILE_GROUP: 4,
        OBU_METADATA: 5,
        OBU_FRAME: 6,
        OBU_REDUNDANT_FRAME_HEADER: 7,
        OBU_TILE_LIST: 8,
        OBU_PADDING : 5,
    };

    static CONSTANTS = {
        REFS_PER_FRAME: 7,
        TOTAL_REFS_PER_FRAME: 8,
        BLOCK_SIZE_GROUPS: 4,
        BLOCK_SIZES: 22,
        BLOCK_INVALID: 22,
        MAX_SB_SIZE: 128,
        MI_SIZE: 4,
        MI_SIZE_LOG2: 2,
        MAX_TILE_WIDTH: 4096,
        MAX_TILE_AREA: 4096 * 2304,
        MAX_TILE_ROWS: 64,
        MAX_TILE_COLS: 64,
        INTRABC_DELAY_PIXELS: 256,
        INTRABC_DELAY_SB64: 4,
        NUM_REF_FRAMES: 8,
        IS_INTER_CONTEXTS: 4,
        REF_CONTEXTS: 3,
        MAX_SEGMENTS: 8,
        SEGMENT_ID_CONTEXTS: 3,
        SEG_LVL_ALT_Q: 0,
        SEG_LVL_ALT_LF_Y_V: 1,
        SEG_LVL_REF_FRAME: 5,
        SEG_LVL_SKIP: 6,
        SEG_LVL_GLOBALMV: 7,
        SEG_LVL_MAX: 8,
        PLANE_TYPES: 2,
        TX_SIZE_CONTEXTS: 3,
        INTERP_FILTERS: 3,
        INTERP_FILTER_CONTEXTS: 16,
        SKIP_MODE_CONTEXTS: 3,
        SKIP_CONTEXTS: 3,
        PARTITION_CONTEXTS: 4,
        TX_SIZES: 5,
        TX_SIZES_ALL: 19,
        TX_MODES: 3,
        DCT_DCT: 0,
        ADST_DCT: 1,
        DCT_ADST: 2,
        ADST_ADST: 3,
        FLIPADST_DCT: 4,
        DCT_FLIPADST: 5,
        FLIPADST_FLIPADST: 6,
        ADST_FLIPADST: 7,
        FLIPADST_ADST: 8,
        IDTX: 9,
        V_DCT: 10,
        H_DCT: 11,
        V_ADST: 12,
        H_ADST: 13,
        V_FLIPADST: 14,
        H_FLIPADST: 15,
        TX_TYPES: 16,
        MB_MODE_COUNT: 17,
        INTRA_MODES: 13,
        UV_INTRA_MODES_CFL_NOT_ALLOWED: 13,
        UV_INTRA_MODES_CFL_ALLOWED: 14,
        COMPOUND_MODES: 8,
        COMPOUND_MODE_CONTEXTS: 8,
        COMP_NEWMV_CTXS: 5,
        NEW_MV_CONTEXTS: 6,
        ZERO_MV_CONTEXTS: 2,
        REF_MV_CONTEXTS: 6,
        DRL_MODE_CONTEXTS: 3,
        MV_CONTEXTS: 2,
        MV_INTRABC_CONTEXT: 1,
        MV_JOINTS: 4,
        MV_CLASSES: 11,
        CLASS0_SIZE: 2,
        MV_OFFSET_BITS: 10,
        MAX_LOOP_FILTER: 63,
        REF_SCALE_SHIFT: 14,
        SUBPEL_BITS: 4,
        SUBPEL_MASK: 15,
        SCALE_SUBPEL_BITS: 10,
        MV_BORDER: 128,
        PALETTE_COLOR_CONTEXTS: 5,
        PALETTE_MAX_COLOR_CONTEXT_HASH: 8,
        PALETTE_BLOCK_SIZE_CONTEXTS: 7,
        PALETTE_Y_MODE_CONTEXTS: 3,
        PALETTE_UV_MODE_CONTEXTS: 2,
        PALETTE_SIZES: 7,
        PALETTE_COLORS: 8,
        PALETTE_NUM_NEIGHBORS: 3,
        DELTA_Q_SMALL: 3,
        DELTA_LF_SMALL: 3,
        QM_TOTAL_SIZE: 3344,
        MAX_ANGLE_DELTA: 3,
        DIRECTIONAL_MODES: 8,
        ANGLE_STEP: 3,
        TX_SET_TYPES_INTRA: 3,
        TX_SET_TYPES_INTER: 4,
        WARPEDMODEL_PREC_BITS: 16,
        IDENTITY: 0,
        TRANSLATION: 1,
        ROTZOOM: 2,
        AFFINE: 3,
        GM_ABS_TRANS_BITS: 12,
        GM_ABS_TRANS_ONLY_BITS: 9,
        GM_ABS_ALPHA_BITS: 12,
        DIV_LUT_PREC_BITS: 14,
        DIV_LUT_BITS: 8,
        DIV_LUT_NUM: 257,
        MOTION_MODES: 3,
        SIMPLE: 0,
        OBMC: 1,
        LOCALWARP: 2,
        LEAST_SQUARES_SAMPLES_MAX: 8,
        LS_MV_MAX: 256,
        WARPEDMODEL_TRANS_CLAMP: 1<<23,
        WARPEDMODEL_NONDIAGAFFINE_CLAMP: 1<<13,
        WARPEDPIXEL_PREC_SHIFTS: 1<<6,
        WARPEDDIFF_PREC_BITS: 10,
        GM_ALPHA_PREC_BITS: 15,
        GM_TRANS_PREC_BITS: 6,
        GM_TRANS_ONLY_PREC_BITS: 3,
        INTERINTRA_MODES: 4,
        MASK_MASTER_SIZE: 64,
        SEGMENT_ID_PREDICTED_CONTEXTS: 3,
        IS_INTER_CONTEXTS: 4,
        FWD_REFS: 4,
        BWD_REFS: 3,
        SINGLE_REFS: 7,
        UNIDIR_COMP_REFS: 4,
        COMPOUND_TYPES: 2,
        CFL_JOINT_SIGNS: 8,
        CFL_ALPHABET_SIZE: 16,
        COMP_INTER_CONTEXTS: 5,
        COMP_REF_TYPE_CONTEXTS: 5,
        CFL_ALPHA_CONTEXTS: 6,
        INTRA_MODE_CONTEXTS: 5,
        COMP_GROUP_IDX_CONTEXTS: 6,
        COMPOUND_IDX_CONTEXTS: 6,
        INTRA_EDGE_KERNELS: 3,
        INTRA_EDGE_TAPS: 5,
        FRAME_LF_COUNT: 4,
        MAX_VARTX_DEPTH: 2,
        TXFM_PARTITION_CONTEXTS: 21,
        REF_CAT_LEVEL: 640,
        MAX_REF_MV_STACK_SIZE: 8,
        MFMV_STACK_SIZE: 3,
        MAX_TX_DEPTH: 2,
        WEDGE_TYPES: 16,
        FILTER_BITS: 7,
        WIENER_COEFFS: 3,
        SGRPROJ_PARAMS_BITS: 4,
        SGRPROJ_PRJ_SUBEXP_K: 4,
        SGRPROJ_PRJ_BITS: 7,
        SGRPROJ_RST_BITS: 4,
        SGRPROJ_MTABLE_BITS: 20,
        SGRPROJ_RECIP_BITS: 12,
        SGRPROJ_SGR_BITS: 8,
        EC_PROB_SHIFT: 6,
        EC_MIN_PROB: 4,
        SELECT_SCREEN_CONTENT_TOOLS: 2,
        SELECT_INTEGER_MV: 2,
        RESTORATION_TILESIZE_MAX: 256,
        MAX_FRAME_DISTANCE: 31,
        MAX_OFFSET_WIDTH: 8,
        MAX_OFFSET_HEIGHT: 0,
        WARP_PARAM_REDUCE_BITS: 6,
        NUM_BASE_LEVELS: 2,
        COEFF_BASE_RANGE: 12,
        BR_CDF_SIZE: 4,
        SIG_COEF_CONTEXTS_EOB: 4,
        SIG_COEF_CONTEXTS_2D: 26,
        SIG_COEF_CONTEXTS: 42,
        SIG_REF_DIFF_OFFSET_NUM: 5,
        SUPERRES_NUM: 8,
        SUPERRES_DENOM_MIN: 9,
        SUPERRES_DENOM_BITS: 3,
        SUPERRES_FILTER_BITS: 6,
        SUPERRES_FILTER_SHIFTS: 1 << 6,
        SUPERRES_FILTER_TAPS: 8,
        SUPERRES_FILTER_OFFSET: 3,
        SUPERRES_SCALE_BITS: 14,
        SUPERRES_SCALE_MASK: (1 << 14) - 1,
        SUPERRES_EXTRA_BITS: 8,
        TXB_SKIP_CONTEXTS: 13,
        EOB_COEF_CONTEXTS: 9,
        DC_SIGN_CONTEXTS: 3,
        LEVEL_CONTEXTS: 21,
        TX_CLASS_2D: 0,
        TX_CLASS_HORIZ: 1,
        TX_CLASS_VERT: 2,
        REFMVS_LIMIT: ( 1 << 12 ) - 1,
        INTRA_FILTER_SCALE_BITS: 4,
        INTRA_FILTER_MODES: 5,
        COEFF_CDF_Q_CTXS: 4,
        PRIMARY_REF_NONE: 7,
        BUFFER_POOL_MAX_SIZE: 10,
    }

    static create(buffer) {
        let array = new Uint8Array(buffer, 0, buffer.byteLength);
        let reader = new BitReader(array, 0);

        let obu = new OBU();

        obu.parse(reader);

        return obu;
    }

    parse(reader) {
        this.obu_header(reader);

        if ( this.obu_type == OBU.TYPES.OBU_SEQUENCE_HEADER )
            this.sequence_header_obu(reader)
    }

    obu_header(reader) {
        let obu_forbiddenBit = reader.readOneBit();
        this.obu_type = reader.readBits(4);
        this.obu_extension_flag = reader.readOneBit();
        let obu_has_size_field = reader.readOneBit();
        reader.skipBits(1); // obu_reserved_1bit f(1)

        if ( this.obu_extension_flag == 1 ) {
            this.temporal_id = reader.readBits(3);
            this.spatial_id = reader.readBits(2);
            reader.skipBits(3); // extension_header_reserved_3bits f(3)
        }

        this.size = 0;
        if (obu_has_size_field) {
            let localObuSize = reader.readLeb128();
            let offset = reader.bitPos / 8;
            this.size = localObuSize + offset;
        } else {
            this.size = buffer.byteLength;
        }
    }

    sequence_header_obu(reader) {
        this.type = 'Sequence Header';

        this.seq_profile = reader.readBits(3);
        this.still_picture = reader.readOneBit();
        let reduced_still_picture_header = reader.readOneBit();
        if (reduced_still_picture_header) {
            this.timing_info_present_flag = false;
            this.decoder_model_info_present_flag = false;
            this.initial_display_delay_present_flag = false;
            this.operating_points_cnt_minus_1 = 0;
            this.operating_point_idc = [ 0 ];
            this.seq_level_idx[ reader.readBits(5) ];
            this.decoder_model_present_for_this_op = [ 0 ];
            this.initial_display_delay_present_for_this_op = [ 0 ];
        } else {
            let timing_info_present_flag = reader.readOneBit();
            if ( timing_info_present_flag ) {
                this.timing_info(reader);

                this.decoder_model_info_present_flag = reader.readOneBit();
                if (decoder_model_info_present_flag)
                    this.decoder_model_info(reader);
            } else
                this.decoder_model_info_present_flag = false;

            this.initial_display_delay_present_flag = reader.readOneBit();
            this.operating_points_cnt_minus_1 = reader.readBits(5)

            this.operating_point_idc = [];
            this.seq_level_idx = [];
            this.seq_tier = [];
            this.decoder_model_present_for_this_op = [];
            this.initial_display_delay_present_for_this_op = [];

            for ( var i = 0; i <= this.operating_points_cnt_minus_1; i++ ) {
                this.operating_point_idc.push(reader.readBits(12));
                this.seq_level_idx.push(reader.readBits(5));
                if ( this.seq_level_idx[ i ] > 7 ) {  
                    this.seq_tier.push(reader.readBits(1));
                } else {     
                    this.seq_tier.push(0);
                }
                if ( this.decoder_model_info_present_flag ) {     
                    this.decoder_model_present_for_this_op.push(reader.readBits(1));
                    if ( this.decoder_model_present_for_this_op[ i ] ) {  
                        this.operating_parameters_info(reader, i)   
                    }    
                } else {     
                    this.decoder_model_present_for_this_op.push(0   );
                }    
                if ( this.initial_display_delay_present_flag ) {  
                    this.initial_display_delay_present_for_this_op.push(reader.readBits(1));
                    if ( this.initial_display_delay_present_for_this_op[ i ] ) {  
                        this.initial_display_delay_minus_1.push(reader.readBits(4));
                    }
                }
            }   
        }

        let operatingPoint = this.choose_operating_point( )   
        let OperatingPointIdc = this.operating_point_idc[ operatingPoint ]    
        this.frame_width_bits_minus_1    = reader.readBits(4);
        this.frame_height_bits_minus_1   = reader.readBits(4);
        let n = this.frame_width_bits_minus_1 + 1     
        this.max_frame_width_minus_1 = reader.readBits(n);
        n = this.frame_height_bits_minus_1 + 1    
        this.max_frame_height_minus_1    = reader.readBits(n);
        if ( this.reduced_still_picture_header )  
            this.frame_id_numbers_present_flag = 0    
        else     
            this.frame_id_numbers_present_flag   = reader.readBits(1);
        if ( this.frame_id_numbers_present_flag ) {   
            this.delta_frame_id_length_minus_2   = reader.readBits(4);
            this.additional_frame_id_length_minus_1  = reader.readBits(3);
        }    
        this.use_128x128_superblock  = reader.readBits(1);
        this.enable_filter_intra = reader.readBits(1);
        this.enable_intra_edge_filter    = reader.readBits(1);
        if ( this.reduced_still_picture_header ) {    
            this.enable_interintra_compound = 0   
            this.enable_masked_compound = 0   
            this.enable_warped_motion = 0     
            this.enable_dual_filter = 0   
            this.enable_order_hint = 0    
            this.enable_jnt_comp = 0  
            this.enable_ref_frame_mvs = 0     
            this.seq_force_screen_content_tools = OBU.CONSTANTS.SELECT_SCREEN_CONTENT_TOOLS     
            this.seq_force_integer_mv = OBU.CONSTANTS.SELECT_INTEGER_MV     
            this.OrderHintBits = 0    
        } else {     
            this.enable_interintra_compound  = reader.readBits(1);
            this.enable_masked_compound  = reader.readBits(1);
            this.enable_warped_motion    = reader.readBits(1);
            this.enable_dual_filter  = reader.readBits(1);
            this.enable_order_hint   = reader.readBits(1);
            if ( this.enable_order_hint ) {   
                this.enable_jnt_comp = reader.readBits(1);
                this.enable_ref_frame_mvs    = reader.readBits(1);
            } else {     
                this.enable_jnt_comp = 0  
                this.enable_ref_frame_mvs = 0     
            }    
            let seq_choose_screen_content_tools = reader.readBits(1);
            if ( seq_choose_screen_content_tools ) {     
                this.seq_force_screen_content_tools = OBU.CONSTANTS.SELECT_SCREEN_CONTENT_TOOLS     
            } else {     
                this.seq_force_screen_content_tools  = reader.readBits(1);
            }    
                                                                     
            if ( this.seq_force_screen_content_tools > 0 ) {  
                this.seq_choose_integer_mv   = reader.readBits(1);
                if ( this.seq_choose_integer_mv ) {   
                    this.seq_force_integer_mv = OBU.CONSTANTS.SELECT_INTEGER_MV     
                } else {     
                    this.seq_force_integer_mv    = reader.readBits(1);
                }    
            } else {     
                this.seq_force_integer_mv = OBU.CONSTANTS.SELECT_INTEGER_MV     
            }    
            if ( this.enable_order_hint ) {   
                this.order_hint_bits_minus_1 = reader.readBits(3);
                this.OrderHintBits = this.order_hint_bits_minus_1 + 1  
            } else {     
                this.OrderHintBits = 0    
            }    
        }    
        this.enable_superres = reader.readBits(1);
        this.enable_cdef = reader.readBits(1);
        this.enable_restoration  = reader.readBits(1);
        this.color_config(reader)  
        this.film_grain_params_present   = reader.readBits(1);
    }

    timing_info(reader) {
        this.num_units_in_display_tick = reader.readBits(32);
        this.time_scale = reader.readBits(32);
        let equal_picture_interval = reader.readOneBit();
        if ( equal_picture_interval )
            this.num_ticks_per_picture_minus_1 = reader.uvlc();
    }

    decoder_model_info(reader) {
        this.buffer_delay_length_minus_1 = reader.readBits(5)
        this.num_units_in_decoding_tick = reader.readBits(32)
        this.buffer_removal_time_length_minus_1 = reader.readBits(5)
        this.frame_presentation_time_length_minus_1 = reader.readBits(5)
    }

    operating_parameters_info(reader, i) {
        // ...
    }

    choose_operating_point() {
        return 0;
    }

    color_config(reader) {
        let high_bitdepth   = reader.readBits(1);
        if ( this.seq_profile == 2 && this.high_bitdepth ) {   
            let twelve_bit  = reader.readBits(1);
            this.BitDepth = twelve_bit ? 12 : 10  
        } else if ( this.seq_profile <= 2 ) {     
            this.BitDepth = high_bitdepth ? 10 : 8    
        }    
        if ( this.seq_profile == 1 ) {    
            this.mono_chrome = 0  
        } else {     
            this.mono_chrome = reader.readBits(1);
        }    
        this.NumPlanes = this.mono_chrome ? 1 : 3  
        let color_description_present_flag  = reader.readBits(1);
        if ( color_description_present_flag ) {  
            this.color_primaries = reader.readBits(8);
            this.transfer_characteristics    = reader.readBits(8);
            this.matrix_coefficients = reader.readBits(8);
        } else {     
            this.color_primaries = OBU.CONSTANTS.CP_UNSPECIFIED     
            this.transfer_characteristics = OBU.CONSTANTS.TC_UNSPECIFIED    
            this.matrix_coefficients = OBU.CONSTANTS.MC_UNSPECIFIED     
        }    
        if ( this.mono_chrome ) {     
            this.color_range = reader.readBits(1);
            this.subsampling_x = 1    
            this.subsampling_y = 1    
            this.chroma_sample_position = OBU.CONSTANTS.CSP_UNKNOWN     
            this.separate_uv_delta_q = 0  
            return
        } else if ( this.color_primaries == OBU.CONSTANTS.CP_BT_709 &&  
                    this.transfer_characteristics == OBU.CONSTANTS.TC_SRGB &&   
                    this.matrix_coefficients == OBU.CONSTANTS.MC_IDENTITY ) {   
            this.color_range = 1  
            this.subsampling_x = 0    
            this.subsampling_y = 0    
        } else {     
            this.color_range = reader.readBits(1);
            if ( this.seq_profile == 0 ) {    
                this.subsampling_x = 1    
                this.subsampling_y = 1    
            } else if ( this.seq_profile == 1 ) {     
                this.subsampling_x = 0    
                this.subsampling_y = 0    
            } else {     
                if ( this.BitDepth == 12 ) {  
                    this.subsampling_x   = reader.readBits(1);
                    if ( this.subsampling_x )     
                        this.subsampling_y   = reader.readBits(1);
                    else     
                        this.subsampling_y = 0    
                } else {     
                    this.subsampling_x = 1    
                    this.subsampling_y = 0    
                }    
            }    
            if ( this.subsampling_x && this.subsampling_y ) {  
                this.chroma_sample_position  = reader.readBits(2);
            }    
        }    
        this.separate_uv_delta_q = reader.readBits(1);
    }
}
