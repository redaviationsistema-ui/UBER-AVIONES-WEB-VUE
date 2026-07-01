/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RegisterClientStep from '../features/register/RegisterClientStep.vue'

function buildForm(role = 'client') {
  return {
    role,
    name: '',
    companyName: '',
    phone: '',
    birthDate: '',
  }
}

describe('RegisterClientStep', () => {
  it('shows the company name field for provider registrations', () => {
    const wrapper = mount(RegisterClientStep, {
      props: {
        form: buildForm('provider'),
      },
    })

    expect(wrapper.text()).toContain('Nombre de la empresa')
  })

  it('does not show the company name field for crew registrations', () => {
    const wrapper = mount(RegisterClientStep, {
      props: {
        form: buildForm('sobrecargo'),
      },
    })

    expect(wrapper.text()).not.toContain('Nombre de la empresa')
  })
})
