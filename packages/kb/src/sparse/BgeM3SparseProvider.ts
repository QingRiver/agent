import type { SparseProvider } from './SparseProvider'

export class BgeM3SparseProvider implements SparseProvider {
  async search(): Promise<never> {
    throw new Error('BgeM3SparseProvider not implemented')
  }
}
