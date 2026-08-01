/**
 * Cliente Tauri para Cloud Save commands.
 */

import { invoke } from '@tauri-apps/api/core'
import type {
  ArtifactMetadata,
  CloudSaveSettings,
  UploadResult,
} from '../../types/contracts/cloudSave'

/** Pega as configurações atuais do Cloud Save. */
export async function getCloudSaveSettings(): Promise<CloudSaveSettings> {
  return invoke<CloudSaveSettings>('get_cloud_save_settings')
}

/** Atualiza as configurações do Cloud Save. */
export async function setCloudSaveSettings(settings: CloudSaveSettings): Promise<void> {
  return invoke<void>('set_cloud_save_settings', { settings })
}

/** Testa a conexão com o backend ativo. */
export async function testCloudSaveConnection(): Promise<string> {
  return invoke<string>('test_cloud_save_connection')
}

/** Lista todos os artifacts (backups) salvos para um jogo. */
export async function listCloudSaveArtifacts(
  shop: string,
  objectId: string,
): Promise<ArtifactMetadata[]> {
  return invoke<ArtifactMetadata[]>('list_cloud_save_artifacts', { shop, objectId })
}

/** Faz backup de uma pasta de save e faz upload. */
export async function uploadCloudSave(
  shop: string,
  objectId: string,
  saveFolderPath: string,
  label: string,
): Promise<UploadResult> {
  return invoke<UploadResult>('upload_cloud_save', {
    shop,
    objectId,
    saveFolderPath,
    label,
  })
}

/** Faz download de um artifact para um caminho local. */
export async function downloadCloudSave(
  artifactId: string,
  destPath: string,
): Promise<void> {
  return invoke<void>('download_cloud_save', { artifactId, destPath })
}

/** Restaura um artifact: baixa + extrai para a pasta de save (com backup do atual). */
export async function restoreCloudSave(
  artifactId: string,
  shop: string,
  objectId: string,
  saveFolderPath: string,
): Promise<void> {
  return invoke<void>('restore_cloud_save', {
    artifactId,
    shop,
    objectId,
    saveFolderPath,
  })
}

/** Deleta um artifact do backend. */
export async function deleteCloudSave(
  artifactId: string,
  shop: string,
  objectId: string,
): Promise<void> {
  return invoke<void>('delete_cloud_save', { artifactId, shop, objectId })
}

/** Alterna o estado de frozen de um artifact. */
export async function setCloudSaveFrozen(
  artifactId: string,
  frozen: boolean,
): Promise<void> {
  return invoke<void>('set_cloud_save_frozen', { artifactId, frozen })
}

/** Abre dialog nativo para selecionar pasta de save. */
export async function selectSaveFolder(): Promise<string | null> {
  return invoke<string | null>('select_save_folder')
}
