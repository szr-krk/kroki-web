const seciliCizimAraci = document.querySelector("#gridCizimAraclari .rail-tool-btn[data-arac].is-selected");

window.krokiEditorState = (() => {
  let aktifArac = seciliCizimAraci?.dataset.arac || "";
  let duzenlenenNesne = null;
  let duzenlemeModu = "";

  return {
    isBlockingOverlayOpen() {
      return Boolean(document.querySelector(".modal-panel:not(.gizli), .rail-menu-panel:not(.gizli), #freeTextComposer:not(.gizli)"));
    },

    getActiveTool() {
      return aktifArac;
    },

    setActiveTool(arac) {
      aktifArac = arac || "";
    },

    getEditedObject() {
      return duzenlenenNesne;
    },

    getEditMode() {
      return duzenlemeModu;
    },

    setEditedObject(nesne, mod) {
      duzenlenenNesne = nesne;
      duzenlemeModu = mod || "";
    },

    clearEditedObject() {
      duzenlenenNesne = null;
      duzenlemeModu = "";
    }
  };
})();
