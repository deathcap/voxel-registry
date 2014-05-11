
var toArray = require('toarray');

module.exports = function(game, opts) {
  return new Registry(game, opts);
};

function Registry(game, opts) {
  this.game = game;

  this.blockProps = [ {} ];
  this.blockName2Index = { air:0 };
  this.blockIndex2Name = ['air'];

  this.itemProps = {};
}

Registry.prototype.registerBlock = function(name, props) {
  var nextIndex = this.blockProps.length;
  if (this.blockName2Index[name])
    throw new Error('registerBlock: duplicate block name '+name+', existing index '+this.blockName2Index[name]+' attempted overwrite by '+nextIndex);

  this.blockProps.push(props);
  this.blockName2Index[name] = nextIndex;
  this.blockIndex2Name[nextIndex] = name;

  return nextIndex;
};

Registry.prototype.registerBlocks = function(name, count, props) {
  var startIndex = this.registerBlock(props.names && props.names[0] || name + '#0', props); // TODO: just 'name' instead? (no suffix)
  var lastIndex = startIndex;

  // register this many blocks

  props.baseIndex = startIndex;
  props.getOffsetIndex = function(n) {
    return n - startIndex;
  };

  for (var i = 1; i < count; i += 1) {
    var thisName = props.names && props.names[i] || name + '#' + i; // TODO: take in array as name instead of a 'names' property?
    var thisIndex = this.registerBlock(thisName, props); // unique name and index, but same props for all

    lastIndex = thisIndex;
  }

  props.offsetIndexCount = count;
  props.lastIndex = lastIndex;
};

Registry.prototype.getBlockMeta = function(name) {
  var blockIndex = (typeof name === 'number') ? name : this.getBlockIndex(name);
  if (blockIndex === undefined) {
    return undefined;
  }

  var props = this.blockProps[blockIndex];
  if (!props) {
    return undefined;
  }

  if (props.baseIndex === undefined) {
    return undefined; // no metadata for this block type
  }

  return blockIndex - props.baseIndex;
};

Registry.prototype.getBlockBaseName = function(name) {
  var blockIndex = (typeof name === 'number') ? name : this.getBlockIndex(name);
  if (blockIndex === undefined) {
    throw new Error('getBlockBaseName('+name+'): invalid block name');
  }

  var props = this.blockProps[blockIndex];
  if (!props || props.baseIndex === undefined) {
    return undefined;
  }

  return this.getBlockName(props.baseIndex);
}

Registry.prototype.changeBlockMeta = function(name, meta) {
  var baseIndex = (typeof name === 'number') ? name : this.getBlockIndex(name);
  if (baseIndex === undefined) {
    throw new Error('setBlockMeta('+name+','+meta+'): invalid block name');
  }

  var props = this.blockProps[baseIndex];
  if (!props || props.baseIndex === undefined) {
    throw new Error('setBlockMeta('+name+','+meta+'): not a metablock');
  }
  baseIndex = props.baseIndex; // might be the same, but can change already-existing metadata, too

  if (meta < 0 || meta > props.lastIndex) {
    throw new Error('setBlockMeta('+name+','+meta+'): out of range 0-'+props.lastIndex);
  }

  var blockIndex = baseIndex + meta;

  return blockIndex;
}


Registry.prototype.getBlockIndex = function(name) {
  return this.blockName2Index[name];
};

Registry.prototype.getBlockName = function(blockIndex) {
  var name = this.blockIndex2Name[blockIndex];
    
  return name ? name : '<index #'+blockIndex+'>';
};

Registry.prototype.getBlockProps = function(name) {
  var blockIndex = this.getBlockIndex(name);
  return this.blockProps[blockIndex];
};

Registry.prototype.getBlockPropsAll = function(prop) {
  var props = [];
  for (var i = 1; i < this.blockProps.length; ++i) {
    props.push(this.getProp(i, prop));
  }
  return props;
};


Registry.prototype.registerItem = function(name, props) {
  if (this.itemProps[name])
    throw new Error('registerItem: duplicate item name '+name+', existing properties: '+this.itemProps[name]);
  if (this.blockName2Index[name])
    throw new Error('registerItem: item name '+name+' conflicts with existing block name of index'+this.blockName2Index[name]);

  this.itemProps[name] = props;
};

Registry.prototype.getItemProps = function(name) {
  return this.itemProps[name] || this.getBlockProps(name); // blocks are implicitly also items
};


Registry.prototype.getProp = function(itemName, propName, arg) {
  var props;

  if (typeof itemName === 'number') {
    props = this.blockProps[itemName];
  } else {
    props = this.getItemProps(itemName);
  }

  if (props === undefined) return undefined;

  var value = props[propName];

  if (typeof value === 'function') {
    // dynamic properties
    var index = (typeof itemName === 'number') ? itemName : this.getBlockIndex(itemName);
    if (index)  {
      // call metablocks with index offset argument
      value = value.call(props, index - (props.baseIndex || index), arg);
    } else {
      // call with optional argument, if any (can be used for items)
      value = value.call(props, arg);
    }
  }

  return value;
};

Registry.prototype.getItemTexture = function(name, tags) {
  // TODO: default for missing texture
  textureName = 'gravel';

  var textureName = this.getProp(name, 'itemTexture', tags);

  if (textureName === undefined) {
    var blockTexture = this.getProp(name, 'texture', tags);

    if (blockTexture !== undefined) {
      // no item texture, use block texture
      // 3D CSS cube using https://github.com/deathcap/cube-icon
      return toArray(blockTexture).map(this.getTextureURL);
    }
  }

  // returns a Blob URL, could point inside a zipped pack
  return Array.isArray(textureName) ? textureName.map(this.getTextureURL) : this.getTextureURL(textureName);
};

Registry.prototype.getItemDisplayName = function(name) {
  var displayName = this.getProp(name, 'displayName');

  if (displayName !== undefined) return displayName;

  // default is initial-uppercased internal name
  var initialCap = name.substr(0, 1).toUpperCase();
  var rest = name.substr(1);
  return initialCap + rest;
};

Registry.prototype.getItemPileTexture = function(itemPile) {
  return this.getItemTexture(itemPile.item, itemPile.tags);
};

// return true if this name is a block, false otherwise (may be an item)
Registry.prototype.isBlock = function(name) {
  return this.blockName2Index[name] !== undefined;
};

// Texture blob URLs - requires https://github.com/deathcap/artpacks
// TODO: move somewhere else?

Registry.prototype.onTexturesReady = function(cb) {
  if (!this.game.materials.artPacks) return;

  if (this.game.materials.artPacks.isQuiescent())
    cb();
  else
    this.game.materials.artPacks.on('loadedAll', cb);
};

Registry.prototype.getTextureURL = function(name) {
  if (!this.game.materials.artPacks) return;

  return this.game.materials.artPacks.getTexture(name);
  // TODO: default texture if undefined
};



