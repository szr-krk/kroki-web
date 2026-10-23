(() => {
  const K = window.Kroki = window.Kroki || {};
  const manager = K.EditorObjectManager, catalog = K.VehicleCatalog, renderer = K.VehicleRenderer;
  const selection = K.SelectionManager, utils = K.EditorUtils;
  const button = document.querySelector('#btnVehicleCouplingIp');
  if (!manager || !catalog || !renderer || !selection || !button) return;
  let choosing = false;

  function variantFor(model) { return model?.type === 'vehicle' ? catalog.findVariant(model.metadata?.vehicleVariantKey) : null; }
  function partsFor(model) { return catalog.rigParts(variantFor(model), model?.metadata || {}); }
  function isSeparate(model) {
    const variant = variantFor(model);
    return !partsFor(model) && (catalog.isTractor(variant) || catalog.isTrailer(variant));
  }
  function candidatesFor(model) {
    if (!isSeparate(model)) return [];
    const tractor = catalog.isTractor(variantFor(model));
    return manager.getAll().filter(other => other.id !== model.id && isSeparate(other)
      && (tractor ? catalog.isTrailer(variantFor(other)) : catalog.isTractor(variantFor(other))));
  }
  function sync(model) {
    const joined = Boolean(partsFor(model));
    button.classList.toggle('gizli', !joined && !isSeparate(model));
    button.querySelector('span').textContent = joined ? 'Ayır' : 'Birleştir';
    button.title = joined ? 'Çekici ve dorseyi ayır' : 'Çekici ve dorseyi birleştir';
    button.setAttribute('aria-label', button.title);
  }
  function atomic(label, operation) {
    const history = K.HistoryManager, transaction = history?.begin(label);
    try {
      const result = operation();
      history?.commit(transaction, label);
      return result;
    } catch (error) {
      if (transaction?.before) history.restoreState(transaction.before);
      throw error;
    }
  }
  function split(id) {
    const model = manager.get(id), components = model && renderer.componentModelsFor(model);
    if (!components) return null;
    return atomic('Çekici ve dorseyi ayır', () => {
      const groups = K.GroupManager?.getAll().filter(group => group.children.includes(id)) || [];
      manager.updateModel(id, () => ({ ...components.tractor, id }), { skipHistory: true });
      const trailer = manager.add({ ...components.trailer, id: manager.generateId() }, { skipHistory: true });
      if (!trailer) throw Error('Dorse oluşturulamadı');
      groups.forEach(group => K.GroupManager.add({ ...group, children: [...group.children, trailer.id] }));
      selection.edit(id);
      return { tractorId: id, trailerId: trailer.id };
    });
  }
  function join(selectedId, partnerId) {
    const selected = manager.get(selectedId), partner = manager.get(partnerId);
    if (!selected || !partner || !candidatesFor(selected).some(item => item.id === partnerId)) return null;
    const selectedTractor = catalog.isTractor(variantFor(selected));
    const tractor = selectedTractor ? selected : partner, trailer = selectedTractor ? partner : selected;
    const parts = { tractor: variantFor(tractor), trailer: variantFor(trailer) };
    const layout = catalog.rigLayout(parts, 'top', 0);
    const scale = renderer.metricsForModel(selected).scale, rotation = utils.normalizeRotation(selected.geometry.rotation);
    const offset = (layout.hitchX - (selectedTractor ? layout.tractorHitch : layout.trailerHitch)) * scale;
    const radians = rotation * Math.PI / 180;
    const trailerMetadata = catalog.metadataForPart(parts.trailer, trailer.metadata);
    return atomic('Çekici ve dorseyi birleştir', () => {
      manager.updateModel(tractor.id, () => ({
        ...utils.clonePlain(tractor),
        geometry: { cx: selected.geometry.cx - offset * Math.cos(radians), cy: selected.geometry.cy - offset * Math.sin(radians),
          scale, rotation, articulationAngle: 0 },
        metadata: { ...catalog.metadataForPart(parts.tractor, tractor.metadata), vehicleView: 'top', vehicleFlipX: false, vehicleFlipY: false,
          vehicleTrailerVariantKey: parts.trailer.key, vehicleTrailerMetadata: trailerMetadata,
          vehicleTrailerStyle: utils.clonePlain(trailer.style), vehicleTrailerLabel: utils.clonePlain(trailer.label) }
      }), { skipHistory: true });
      manager.remove(trailer.id, { skipHistory: true });
      selection.edit(tractor.id);
      return tractor.id;
    });
  }
  async function choosePartner(id) {
    const model = manager.get(id), candidates = model && candidatesFor(model);
    if (!model || !candidates) return;
    if (!candidates.length) {
      const missing = catalog.isTractor(variantFor(model)) ? 'dorse' : 'çekici';
      await K.Dialog.choice({ kind: 'coupling', title: 'Birleştir', message: `Birleştirmek için çizime ayrı bir ${missing} ekleyin.` });
      return;
    }
    let highlight = null;
    const highlightPartner = value => {
      highlight?.remove(); highlight = null;
      const target = manager.get(value), bounds = target && manager.getAdapter(target)?.getBounds(target);
      if (!bounds) return;
      highlight = utils.createSvgElement('rect', { class: 'editor-coupling-target', x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
        fill: 'rgba(245,158,11,.15)', stroke: '#d97706', 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' });
      manager.canvas.querySelector('#editorEditLayer')?.append(highlight);
    };
    try {
      const chosen = await K.Dialog.select({
        title: 'Çekici ve dorseyi birleştir',
        message: 'Seçili araç yerinde kalır. Seçeceğiniz diğer parça yanına alınır ve üst görünümde düz olarak bağlanır.',
        label: catalog.isTractor(variantFor(model)) ? 'Birleştirilecek dorse' : 'Birleştirilecek çekici',
        choices: candidates.map((item, index) => ({ value: item.id,
          label: `${index + 1}. ${variantFor(item).name}${item.metadata?.vehicleLabelText ? ' · ' + item.metadata.vehicleLabelText : ''}` })),
        value: candidates.length === 1 ? candidates[0].id : '', onChange: highlightPartner,
        preview(value) { const target = manager.get(value); return target ? renderer.renderPreviewSvg(variantFor(target), {
          view: 'top', color: target.metadata.vehicleColor, ghost: target.metadata.vehicleGhost }) : null; }
      });
      if (chosen && !join(id, chosen)) await K.Dialog.alert('Seçilen araçlar artık birleştirilemiyor. Lütfen yeniden seçin.');
    } finally { highlight?.remove(); }
  }
  button.addEventListener('click', async event => {
    event.preventDefault(); event.stopPropagation();
    const state = selection.getState(), model = state?.id && manager.get(state.id);
    if (!model || choosing) return;
    choosing = true;
    try { if (partsFor(model)) split(model.id); else if (isSeparate(model)) await choosePartner(model.id); }
    catch (error) { console.error('Çekici-dorse işlemi tamamlanamadı', error); await K.Dialog.alert('İşlem tamamlanamadı. Lütfen yeniden deneyin.'); }
    finally { choosing = false; }
  });
  K.VehicleCoupling = { sync, split, join, candidatesFor };
})();
