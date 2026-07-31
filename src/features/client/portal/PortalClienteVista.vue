<script>
import { defineComponent } from 'vue'
import ClientTopNav from '../ClientTopNav.vue'
import ConciergeDrawer from '../concierge/ConciergeDrawer.vue'
import ConciergeFloatingChat from '../concierge/ConciergeFloatingChat.vue'
import ConciergeScheduleModal from '../concierge/ConciergeScheduleModal.vue'
import PortalClienteProfileScreen from './PortalClienteProfileScreen.vue'
import PortalClienteReservationScreen from './PortalClienteReservationScreen.vue'
import PortalClienteTripsScreen from './PortalClienteTripsScreen.vue'
import { usePortalClienteVista } from './usePortalClienteVista'
import './styles/PortalClienteVista.css'

export default defineComponent({
  name: 'PortalClienteVista',
  components: {
    ClientTopNav,
    ConciergeDrawer,
    ConciergeFloatingChat,
    ConciergeScheduleModal,
    PortalClienteProfileScreen,
    PortalClienteReservationScreen,
    PortalClienteTripsScreen,
  },
  props: {
    section: { type: String, required: true },
  },
  setup(props) {
    return usePortalClienteVista(props)
  },
})
</script>

<template>
  <div class="client-app-shell">
    <ClientTopNav
      :active-plan="activePlan"
      :active-section="activeSection"
      :items="topNavItems"
      :notification-count="topNavNotificationCount"
      :profile-open="profileMenuOpen"
      :user-first-name="profileDisplayName"
      :user-full-name="profileDisplayName"
      @logout="handleLogout"
      @navigate="go"
      @toggle-profile="profileMenuOpen = !profileMenuOpen"
    />

    <main class="client-page">
      <div v-if="loadingServerData" class="loading-band">Cargando informacion del servidor...</div>

      <PortalClienteReservationScreen
        v-if="activeSection === 'reservar'"
        :active-itinerary-summary="activeItinerarySummary"
        :active-result-filter="activeResultFilter"
        :aircraft-billing-note="aircraftBillingNote"
        :aircraft-capacity-label="aircraftCapacityLabel"
        :aircraft-class-label="aircraftClassLabel"
        :aircraft-sidebar-filters="aircraftSidebarFilters"
        :aircraft-sidebar-passenger-bounds="aircraftSidebarPassengerBounds"
        :aircraft-sidebar-price-bounds="aircraftSidebarPriceBounds"
        :aircraft-sidebar-service-options="aircraftSidebarServiceOptions"
        :aircraft-sidebar-speed-bounds="aircraftSidebarSpeedBounds"
        :aircraft-sidebar-type-options="aircraftSidebarTypeOptions"
        :aircraft-includes="aircraftIncludes"
        :aircraft-price-copy="aircraftPriceCopy"
        :aircraft-speed-line="aircraftSpeedLine"
        :aircraft-visual-style="aircraftVisualStyle"
        :commercial-access-action-disabled="isCreatingAccessCheckout"
        :commercial-access-cta-label="commercialAccessCtaLabel"
        :commercial-trial-notice="commercialTrialNotice"
        :featured-aircraft="featuredAircraft"
        :is-results-section="isResultsSection"
        :itinerary-date-line="itineraryDateLine"
        :itinerary-headline="itineraryHeadline"
        :itinerary-summary="itinerarySummary"
        :reservation-action-label="reservationActionLabel"
        :reservation-loading-state="reservationLoadingState"
        :reserving-aircraft-id="reservingAircraftId"
        :result-filter-options="resultFilterOptions"
        :search-form="searchForm"
        :searching="searching"
        :secondary-aircraft-options="secondaryAircraftOptions"
        :server-search-error="serverSearchError"
        :should-show-commercial-access-cta="shouldShowCommercialAccessCta"
        :trip-type="tripType"
        @add-leg="addLeg"
        @go-commercial-access-payment="goToCommercialAccessPayment"
        @remove-leg="removeLeg"
        @request-reservation="requestReservation"
        @select-form-airport="selectFormAirport"
        @select-leg-airport="selectLegAirport"
        @submit-search="submitSearch"
        @clear-aircraft-sidebar-filters="clearAircraftSidebarFilters"
        @contact-concierge="openConciergeDrawer()"
        @modify-search="go('reservar')"
        @retry-search="submitSearch"
        @update:active-result-filter="activeResultFilter = $event"
        @update-aircraft-sidebar-filter="updateAircraftSidebarFilter"
        @update-form-field="updateSearchField"
        @update-leg-field="updateLegField"
        @update-trip-type="tripType = $event"
      />

      <PortalClienteTripsScreen
        v-else-if="activeSection === 'viajes'"
        :assisted-payment-proof-file="assistedPaymentProofFile"
        :assisted-payment-proof-name="assistedPaymentProofName"
        :assisted-payment-proof-uploaded="assistedPaymentProofUploaded"
        :assisted-primary-cta-label="assistedPrimaryCtaLabel"
        :active-aircraft-hold-summary="activeAircraftHoldSummary"
        :back-reservation-id="commercialAccessCheckoutReturnMode ? '' : reservationContextId"
        :back-section="commercialAccessCheckoutReturnMode ? 'reservar' : 'contrato'"
        :can-render-reservation-workflow="canRenderReservationWorkflow"
        :can-upload-assisted-payment-proof="canUploadAssistedPaymentProof"
        :commercial-access-checkout-facts="commercialAccessCheckoutFacts"
        :commercial-access-checkout-screen-mode="commercialAccessCheckoutScreenMode"
        :commercial-access-checkout-return-mode="commercialAccessCheckoutReturnMode"
        :commercial-access-checkout-return-pending="commercialAccessCheckoutReturnPending"
        :commercial-access-cta-label="commercialAccessCtaLabel"
        :customer-display-name="customerDisplayName"
        :format-detailed-currency-by-code="formatDetailedCurrencyByCode"
        :has-reservations-loaded="hasReservationsLoaded"
        :payment-breakdown-amount-map="paymentBreakdownAmountMap"
        :payment-breakdown-currency="paymentBreakdownCurrency"
        :payment-breakdown-rows="paymentBreakdownRows"
        :payment-can-submit="paymentCanSubmit"
        :payment-date-label="paymentDateLabel"
        :payment-feature-list="paymentFeatureList"
        :payment-form="paymentForm"
        :payment-availability-loading="paymentAvailabilityLoading"
        :payment-hero-copy="paymentHeroCopy"
        :payment-hero-title="paymentHeroTitle"
        :payment-inline-error="paymentInlineError"
        :payment-last-reference="paymentLastReference"
        :payment-method-cards="paymentMethodCards"
        :payment-method-summary-label="paymentMethodSummaryLabel"
        :payment-proof-uploading="paymentProofUploading"
        :payment-route-headline="paymentRouteHeadline"
        :payment-submitting="paymentSubmitting"
        :payment-summary-amount-label="paymentSummaryAmountLabel"
        :props-section="props.section"
        :refreshing-reservations="refreshingReservations"
        :reservation-checkout-return-pending="reservationCheckoutReturnPending"
        :reservation-context-id="reservationContextId"
        :reservations="reservations"
        :route-subsection="routeSubsection"
        :payment-method-explicitly-selected="paymentMethodExplicitlySelected"
        :selected-payment-method="selectedPaymentMethod"
        :selected-reservation="selectedReservation"
        :selected-reservation-frontend-state="selectedReservationFrontendState"
        :selected-trip-id="selectedTripId"
        :signing-contract="signingContract"
        :timeline="timeline"
        :trips-initial-tab="tripsInitialTab"
        @confirm-contract="handleContractConfirm"
        @generate-assisted-payment-pdf="handleGenerateAssistedPaymentOrderPdf"
        @go="go"
        @manual-refresh="handleManualReservationsRefresh"
        @open-concierge="goToConcierge($event)"
        @open-contract="handleOpenContract"
        @open-detail="goToReservationDetail($event)"
        @open-payment="goToPayment($event)"
        @payment-submit="handlePaymentSubmit"
        @resolve-availability-conflict="handleResolveAvailabilityConflict"
        @select-assisted-payment-proof="handleAssistedPaymentProofSelection"
        @send-assisted-payment-email="handleSendAssistedPaymentOrderEmail"
        @update:payment-contact-email="paymentForm.contactEmail = $event"
        @update:selected-payment-method="handlePaymentMethodSelection($event)"
        @upload-assisted-payment-proof="handleAssistedPaymentProofUpload"
      />

      <PortalClienteProfileScreen
        v-else
        :access-source="auth.access?.commercial_access || auth.access"
        :active-payment-badge="activePaymentBadge"
        :active-plan="activePlan"
        :commercial-access-renewal-panel="commercialAccessRenewalPanel"
        :commercial-access-cta-label="commercialAccessCtaLabel"
        :has-active-client-access="hasActiveClientAccess"
        :is-commercial-access-expired="isCommercialAccessExpired"
        :other-section-card-copy="otherSectionCardCopy"
        :profile-display-name="profileDisplayName"
        :profile-email="profileEmail"
        :profile-initials="profileInitials"
        :profile-phone="profilePhone"
        :profile-stats="profileStats"
        :section="activeSection"
        :should-show-commercial-access-cta="shouldShowCommercialAccessCta"
        :user-first-name="userFirstName"
        @go-commercial-access-payment="goToCommercialAccessPayment"
      />
    </main>

    <ConciergeDrawer
      :config="conciergeConfig"
      :is-open="isConciergeOpen"
      @close="closeConciergeDrawer"
      @communication="handleConciergeCommunicationSelection"
      @service="handleConciergeServiceSelection"
    />

    <ConciergeFloatingChat
      :config="conciergeConfig"
      :draft="conciergeChatDraft"
      :is-open="isConciergeChatOpen"
      :messages="conciergeChatMessages"
      :selected-service-title="selectedConciergeServiceTitle"
      @close="closeConciergeChat"
      @send="sendConciergeChatMessage"
      @update:draft="conciergeChatDraft = $event"
    />

    <ConciergeScheduleModal
      :config="conciergeConfig"
      :form="conciergeScheduleForm"
      :is-open="isConciergeScheduleOpen"
      @close="closeConciergeScheduleModal"
      @submit="submitConciergeSchedule"
    />

    <nav class="mobile-bottom-nav" aria-label="Navegacion movil">
      <button
        v-for="item in mobileNavItems"
        :key="item.section"
        type="button"
        :class="{ active: activeSection === item.section }"
        @click="go(item.section)"
      >
        {{ item.label }}
      </button>
    </nav>

    <transition name="sheet-fade">
      <div
        v-if="technicalSheetOpen && technicalAircraft"
        class="technical-sheet-backdrop"
        @click.self="closeTechnicalSheet"
      >
        <section class="technical-sheet">
          <div class="technical-sheet__hero">
            <div
              class="technical-sheet__media"
              :style="aircraftVisualStyle(technicalAircraft.image_url)"
            >
              <img
                v-if="technicalAircraft.image_url"
                :src="technicalAircraft.image_url"
                :alt="technicalAircraft.aircraft"
                loading="lazy"
              />
            </div>
            <div class="technical-sheet__copy">
              <span class="eyebrow">Ficha ejecutiva</span>
              <h3>{{ technicalAircraft.aircraft }}</h3>
              <p>{{ aircraftDurationLabel(technicalAircraft) }}</p>
              <strong>{{ aircraftPriceCopy(technicalAircraft) }}</strong>
            </div>
            <button class="technical-sheet__close" type="button" @click="closeTechnicalSheet">
              Cerrar
            </button>
          </div>

          <div class="technical-sheet__body">
            <div class="technical-sheet__map">
              <span>{{ itineraryHeadline(activeItinerarySummary) }}</span>
              <strong>{{ routeDistanceKmForAircraft(technicalAircraft) || 'Ruta' }} km</strong>
            </div>

            <div class="technical-sheet__stats">
              <article>
                <span>Ventana de vuelo</span>
                <strong>{{ aircraftDurationLabel(technicalAircraft) }}</strong>
              </article>
              <article>
                <span>Cabina</span>
                <strong>{{ aircraftClassLabel(technicalAircraft) }}</strong>
              </article>
              <article>
                <span>Capacidad</span>
                <strong>{{ aircraftCapacityLabel(technicalAircraft) }}</strong>
              </article>
            </div>

            <div class="technical-sheet__insights">
              <span class="eyebrow">Insights automáticos</span>
              <ul>
                <li v-for="insight in technicalSheetInsights" :key="insight">{{ insight }}</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </transition>

  </div>
</template>
