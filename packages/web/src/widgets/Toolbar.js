import React from 'react';
import useModalState from '../modals/useModalState';
import ConnectionModal from '../modals/ConnectionModal';
import styled from 'styled-components';
import ToolbarButton, { ToolbarButtonExternalImage } from './ToolbarButton';
import useNewQuery from '../query/useNewQuery';
import { useConfig, useMarkdownManifest } from '../utility/metadataLoaders';
import { useSetOpenedTabs, useOpenedTabs, useCurrentTheme, useSetCurrentTheme } from '../utility/globalState';
import { openNewTab } from '../utility/common';
import useNewFreeTable from '../freetable/useNewFreeTable';
import ImportExportModal from '../modals/ImportExportModal';
import useShowModal from '../modals/showModal';
import useExtensions from '../utility/useExtensions';
import { getDefaultFileFormat } from '../utility/fileformats';
import getElectron from '../utility/getElectron';
import AboutModal from '../modals/AboutModal';

const ToolbarContainer = styled.div`
  display: flex;
  user-select: none;
`;

export default function ToolBar({ toolbarPortalRef }) {
  const modalState = useModalState();
  const newQuery = useNewQuery();
  const newFreeTable = useNewFreeTable();
  const config = useConfig();
  // const toolbar = config.toolbar || [];
  const setOpenedTabs = useSetOpenedTabs();
  const openedTabs = useOpenedTabs();
  const showModal = useShowModal();
  const currentTheme = useCurrentTheme();
  const setCurrentTheme = useSetCurrentTheme();
  const extensions = useExtensions();
  const electron = getElectron();
  const markdownManifest = useMarkdownManifest();

  React.useEffect(() => {
    window['dbgate_createNewConnection'] = modalState.open;
    window['dbgate_newQuery'] = newQuery;
    window['dbgate_closeAll'] = () => setOpenedTabs([]);
    window['dbgate_showAbout'] = showAbout;
  });

  const showAbout = () => {
    showModal((modalState) => <AboutModal modalState={modalState} />);
  };

  const showImport = () => {
    showModal((modalState) => (
      <ImportExportModal
        modalState={modalState}
        importToArchive
        initialValues={{
          sourceStorageType: getDefaultFileFormat(extensions).storageType,
          // sourceConnectionId: data.conid,
          // sourceDatabaseName: data.database,
          // sourceSchemaName: data.schemaName,
          // sourceList: [data.pureName],
        }}
      />
    ));
  };

  const switchTheme = () => {
    if (currentTheme == 'light') setCurrentTheme('dark');
    else setCurrentTheme('light');
  };

  const newMarkdown = () => {
    openNewTab(setOpenedTabs, {
      title: 'Page',
      tabComponent: 'MarkdownEditorTab',
      icon: 'img markdown',
    });
  };

  function openTabFromButton(page) {
    if (
      openedTabs.find(
        (x) => x.tabComponent == 'MarkdownViewTab' && x.props && x.props.file == page.file && x.closedTime == null
      )
    ) {
      setOpenedTabs((tabs) =>
        tabs.map((tab) => ({
          ...tab,
          selected: tab.tabComponent == 'MarkdownViewTab' && tab.props && tab.props.file == page.file,
        }))
      );
    } else {
      openNewTab(setOpenedTabs, {
        title: page.button || page.file,
        tabComponent: 'MarkdownViewTab',
        icon: page.icon || 'img markdown',
        props: {
          file: page.file,
        },
      });
    }
  }

  React.useEffect(() => {
    for (const page of (markdownManifest || []).filter((x) => x.autorun)) {
      openTabFromButton(page);
    }
  }, [markdownManifest]);

  return (
    <ToolbarContainer>
      <ConnectionModal modalState={modalState} />
      {!electron && <ToolbarButtonExternalImage image="/logo192.png" onClick={showAbout} />}
      {(markdownManifest || [])
        .filter((x) => x.button)
        .map((x) => (
          <ToolbarButton key={x.button} onClick={() => openTabFromButton(x)} icon={x.icon || 'icon markdown'}>
            {x.button}
          </ToolbarButton>
        ))}
      {config.runAsPortal == false && (
        <ToolbarButton onClick={modalState.open} icon="icon new-connection">
          Add connection
        </ToolbarButton>
      )}
      <ToolbarButton onClick={newQuery} icon="icon sql-file">
        New Query
      </ToolbarButton>
      <ToolbarButton onClick={newFreeTable} icon="icon table">
        Free table editor
      </ToolbarButton>
      <ToolbarButton onClick={newMarkdown} icon="icon markdown">
        New markdown
      </ToolbarButton>
      <ToolbarButton onClick={showImport} icon="icon import">
        Import data
      </ToolbarButton>
      <ToolbarButton onClick={switchTheme} icon="icon theme">
        {currentTheme == 'dark' ? 'Light mode' : 'Dark mode'}
      </ToolbarButton>

      <ToolbarContainer ref={toolbarPortalRef}></ToolbarContainer>
    </ToolbarContainer>
  );
}
