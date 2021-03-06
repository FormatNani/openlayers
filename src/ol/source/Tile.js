/**
 * @module ol/source/Tile
 */

import {VOID} from '../functions.js';
import TileCache from '../TileCache.js';
import TileState from '../TileState.js';
import Event from '../events/Event.js';
import {equivalent} from '../proj.js';
import {toSize, scale as scaleSize} from '../size.js';
import Source from '../source/Source.js';
import {getKeyZXY, withinExtentAndZ} from '../tilecoord.js';
import {wrapX, getForProjection as getTileGridForProjection} from '../tilegrid.js';

/**
 * @typedef {Object} Options
 * @property {module:ol/source/Source~AttributionLike} [attributions]
 * @property {number} [cacheSize]
 * @property {module:ol/extent~Extent} [extent]
 * @property {boolean} [opaque]
 * @property {number} [tilePixelRatio]
 * @property {module:ol/proj~ProjectionLike} [projection]
 * @property {module:ol/source/State} [state]
 * @property {module:ol/tilegrid/TileGrid} [tileGrid]
 * @property {boolean} [wrapX=true]
 * @property {number} [transition]
 */


/**
 * @classdesc
 * Abstract base class; normally only used for creating subclasses and not
 * instantiated in apps.
 * Base class for sources providing images divided into a tile grid.
 * @api
 */
class TileSource extends Source {
  /**
   * @param {module:ol/source/Tile~Options=} options SourceTile source options.
   */
  constructor(options) {

    super({
      attributions: options.attributions,
      extent: options.extent,
      projection: options.projection,
      state: options.state,
      wrapX: options.wrapX
    });

    /**
     * @private
     * @type {boolean}
     */
    this.opaque_ = options.opaque !== undefined ? options.opaque : false;

    /**
     * @private
     * @type {number}
     */
    this.tilePixelRatio_ = options.tilePixelRatio !== undefined ?
      options.tilePixelRatio : 1;

    /**
     * @protected
     * @type {module:ol/tilegrid/TileGrid}
     */
    this.tileGrid = options.tileGrid !== undefined ? options.tileGrid : null;

    /**
     * @protected
     * @type {module:ol/TileCache}
     */
    this.tileCache = new TileCache(options.cacheSize);

    /**
     * @protected
     * @type {module:ol/size~Size}
     */
    this.tmpSize = [0, 0];

    /**
     * @private
     * @type {string}
     */
    this.key_ = '';

    /**
     * @protected
     * @type {module:ol/Tile~Options}
     */
    this.tileOptions = {transition: options.transition};

  }

  /**
   * @return {boolean} Can expire cache.
   */
  canExpireCache() {
    return this.tileCache.canExpireCache();
  }

  /**
   * @param {module:ol/proj/Projection} projection Projection.
   * @param {!Object<string, module:ol/TileRange>} usedTiles Used tiles.
   */
  expireCache(projection, usedTiles) {
    const tileCache = this.getTileCacheForProjection(projection);
    if (tileCache) {
      tileCache.expireCache(usedTiles);
    }
  }

  /**
   * @param {module:ol/proj/Projection} projection Projection.
   * @param {number} z Zoom level.
   * @param {module:ol/TileRange} tileRange Tile range.
   * @param {function(module:ol/Tile):(boolean|undefined)} callback Called with each
   *     loaded tile.  If the callback returns `false`, the tile will not be
   *     considered loaded.
   * @return {boolean} The tile range is fully covered with loaded tiles.
   */
  forEachLoadedTile(projection, z, tileRange, callback) {
    const tileCache = this.getTileCacheForProjection(projection);
    if (!tileCache) {
      return false;
    }

    let covered = true;
    let tile, tileCoordKey, loaded;
    for (let x = tileRange.minX; x <= tileRange.maxX; ++x) {
      for (let y = tileRange.minY; y <= tileRange.maxY; ++y) {
        tileCoordKey = getKeyZXY(z, x, y);
        loaded = false;
        if (tileCache.containsKey(tileCoordKey)) {
          tile = /** @type {!module:ol/Tile} */ (tileCache.get(tileCoordKey));
          loaded = tile.getState() === TileState.LOADED;
          if (loaded) {
            loaded = (callback(tile) !== false);
          }
        }
        if (!loaded) {
          covered = false;
        }
      }
    }
    return covered;
  }

  /**
   * @param {module:ol/proj/Projection} projection Projection.
   * @return {number} Gutter.
   */
  getGutterForProjection(projection) {
    return 0;
  }

  /**
   * Return the key to be used for all tiles in the source.
   * @return {string} The key for all tiles.
   * @protected
   */
  getKey() {
    return this.key_;
  }

  /**
   * Set the value to be used as the key for all tiles in the source.
   * @param {string} key The key for tiles.
   * @protected
   */
  setKey(key) {
    if (this.key_ !== key) {
      this.key_ = key;
      this.changed();
    }
  }

  /**
   * @param {module:ol/proj/Projection} projection Projection.
   * @return {boolean} Opaque.
   */
  getOpaque(projection) {
    return this.opaque_;
  }

  /**
   * @inheritDoc
   */
  getResolutions() {
    return this.tileGrid.getResolutions();
  }

  /**
   * @abstract
   * @param {number} z Tile coordinate z.
   * @param {number} x Tile coordinate x.
   * @param {number} y Tile coordinate y.
   * @param {number} pixelRatio Pixel ratio.
   * @param {module:ol/proj/Projection} projection Projection.
   * @return {!module:ol/Tile} Tile.
   */
  getTile(z, x, y, pixelRatio, projection) {}

  /**
   * Return the tile grid of the tile source.
   * @return {module:ol/tilegrid/TileGrid} Tile grid.
   * @api
   */
  getTileGrid() {
    return this.tileGrid;
  }

  /**
   * @param {module:ol/proj/Projection} projection Projection.
   * @return {!module:ol/tilegrid/TileGrid} Tile grid.
   */
  getTileGridForProjection(projection) {
    if (!this.tileGrid) {
      return getTileGridForProjection(projection);
    } else {
      return this.tileGrid;
    }
  }

  /**
   * @param {module:ol/proj/Projection} projection Projection.
   * @return {module:ol/TileCache} Tile cache.
   * @protected
   */
  getTileCacheForProjection(projection) {
    const thisProj = this.getProjection();
    if (thisProj && !equivalent(thisProj, projection)) {
      return null;
    } else {
      return this.tileCache;
    }
  }

  /**
   * Get the tile pixel ratio for this source. Subclasses may override this
   * method, which is meant to return a supported pixel ratio that matches the
   * provided `pixelRatio` as close as possible.
   * @param {number} pixelRatio Pixel ratio.
   * @return {number} Tile pixel ratio.
   */
  getTilePixelRatio(pixelRatio) {
    return this.tilePixelRatio_;
  }

  /**
   * @param {number} z Z.
   * @param {number} pixelRatio Pixel ratio.
   * @param {module:ol/proj/Projection} projection Projection.
   * @return {module:ol/size~Size} Tile size.
   */
  getTilePixelSize(z, pixelRatio, projection) {
    const tileGrid = this.getTileGridForProjection(projection);
    const tilePixelRatio = this.getTilePixelRatio(pixelRatio);
    const tileSize = toSize(tileGrid.getTileSize(z), this.tmpSize);
    if (tilePixelRatio == 1) {
      return tileSize;
    } else {
      return scaleSize(tileSize, tilePixelRatio, this.tmpSize);
    }
  }

  /**
   * Returns a tile coordinate wrapped around the x-axis. When the tile coordinate
   * is outside the resolution and extent range of the tile grid, `null` will be
   * returned.
   * @param {module:ol/tilecoord~TileCoord} tileCoord Tile coordinate.
   * @param {module:ol/proj/Projection=} opt_projection Projection.
   * @return {module:ol/tilecoord~TileCoord} Tile coordinate to be passed to the tileUrlFunction or
   *     null if no tile URL should be created for the passed `tileCoord`.
   */
  getTileCoordForTileUrlFunction(tileCoord, opt_projection) {
    const projection = opt_projection !== undefined ?
      opt_projection : this.getProjection();
    const tileGrid = this.getTileGridForProjection(projection);
    if (this.getWrapX() && projection.isGlobal()) {
      tileCoord = wrapX(tileGrid, tileCoord, projection);
    }
    return withinExtentAndZ(tileCoord, tileGrid) ? tileCoord : null;
  }

  /**
   * @inheritDoc
   */
  refresh() {
    this.tileCache.clear();
    this.changed();
  }
}


/**
 * Marks a tile coord as being used, without triggering a load.
 * @param {number} z Tile coordinate z.
 * @param {number} x Tile coordinate x.
 * @param {number} y Tile coordinate y.
 * @param {module:ol/proj/Projection} projection Projection.
 */
TileSource.prototype.useTile = VOID;


/**
 * @classdesc
 * Events emitted by {@link module:ol/source/Tile~TileSource} instances are instances of this
 * type.
 */
export class TileSourceEvent extends Event {
  /**
   * @param {string} type Type.
   * @param {module:ol/Tile} tile The tile.
   */
  constructor(type, tile) {

    super(type);

    /**
     * The tile related to the event.
     * @type {module:ol/Tile}
     * @api
     */
    this.tile = tile;

  }

}

export default TileSource;
