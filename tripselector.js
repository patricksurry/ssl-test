function insertCalendarWidget(selector, host, options) {
    $(selector).html('<div class="trip-selector">\
      <div class="trip-selector-dates"><!--\
        --><div class="trip-selector-dates-column">\
          <div class="trip-selector-dates-label">Depart</div>\
          <div class="trip-selector-departure-date trip-selector-active">Select Date</div>\
        </div><!--\
        --><div class="trip-selector-dates-column">\
          <div class="trip-selector-dates-label">Return</div>\
          <div class="trip-selector-return-date">&mdash;</div>\
        </div><!--\
      --></div>\
      <div class="trip-selector-container"><img src="static/running_bunny.gif"/></div>\
      <div class="trip-selector-choose-button panel-footer cta-footer">\
        <a href="#">Choose These Dates</a>\
      </div>\
    </div>');

    $.ajax({
        url: host + '/flightfeed?' + $.param(options),
        success: function(d) {
            var trips = d.trips;
            trips.forEach(function(t) {
                t.departure_date = new Date(t.departure_date);
                t.return_date = new Date(t.return_date);
            });
            insertCalendarSelector(
                d3.select(selector + ' .trip-selector'),
                trips,
                function(dep, ret) { return deepLink(options.origin, options.destination, dep, ret); }
            );
        }
    })
}

function deepLink(origin, destination, departure_date, return_date, tab) {
    var ymdFormat = d3.time.format.utc('%Y-%m-%d');

    return 'hopper-flights://trip?' + $.param({
        originType: 'airport', //TODO
        originID: origin,
        destinationType: 'airport', //TODO
        destinationID: destination,
        departureDate: ymdFormat(departure_date),
        returnDate: ymdFormat(return_date),
        tab: tab || "flights"
    })
}


/* provide a calendar selector for a list of date pairs, assumed sorted by departure_date
  [ { departure_date: d1, return_date: d2 }, ... ]

  empty return date currently implies anything up to a 28d los

  interacts with various parent elements in d3parent:

  - div.trip-selector-departure-date & ...-return-date: selected dates
  - div.trip-selector-container: holds the selector

  (actually the following can be document-parented?)
  - div.trip-selector-choose-button: contains an <a> with the resulting deeplink
*/
function insertCalendarSelector(d3parent, trips, urlFn) {

    var container = d3parent
        .select('.trip-selector-container');

    container.html('');

    container
        .append('div')
        .classed('trip-selector-info', true)
        .text('No matching trips');

    if (trips.length == 0) return;

    var eeFormat = d3.time.format.utc('%e'),
        mmmFormat = d3.time.format.utc('%b');

    var startDate = d3.time.sunday.utc.floor(trips[0].departure_date),
        endDate = d3.time.sunday.utc.ceil(
            d3.time.day.utc.offset(trips[trips.length-1].departure_date, 28)
        ),
        minEndDate = d3.time.day.utc.offset(startDate, 5*7), // at least five weeks
        dateRange = d3.time.day.utc.range(
            startDate, endDate > minEndDate ? endDate : minEndDate),
        dates = d3.nest()
            .key(function (dt) { return d3.time.sunday.utc.floor(dt); })
            .entries(dateRange);

    container
        .append('div')
        .classed('trip-selector-header', true)
        .selectAll('div')
        .data(["S", "M", "T", "W", "T", "F", "S"])
      .enter().append('div')
        .classed('trip-selector-column', true)
        .text(function(d) { return d; });

    var daydivs = container
        .append('div')
        .classed('trip-selector-body', true)
        .selectAll('div')
        .data(dates)        // grouped by week
      .enter().append('div')
        .selectAll('.trip-selector-column')
        .data(function(d) { return d.values; })
      .enter().append('div')
        .classed('trip-selector-column', true)
        .classed('trip-month-border-top', function(d) { return d.getUTCDate() <= 7 })
        .classed('trip-month-border-left', function(d, i) { return (i > 0) && (d.getUTCDate() == 1); })
        .classed('trip-month-border-bottom', function(d) {
            return d3.time.day.utc.offset(d, 7).getUTCDate() <= 7;
        })
        .classed('trip-month-border-right', function(d, i) {
            return (i < 6) && (d3.time.day.utc.offset(d, 1).getUTCDate() == 1);
        });

    daydivs.filter(function(d) { return (d.getUTCDate() == 1) || d == dateRange[0]; })
      .append('div')
      .classed('trip-selector-mmm-name', true)
      .text(function(d) { return mmmFormat(d).toUpperCase(); });

    daydivs.append('div')
      .classed('trip-selector-day-number', true)
      .text(function(d) { return eeFormat(d).replace(' ',''); });


    showTrips(d3parent, trips, urlFn);
}

function showTrips(d3parent, trips, urlFn) {
    // attach click events to legal departures
    // on depart click, 'toggle' target,
    //   if on, mark selected,
    //      remove departure click handlers (except selected)
    //     attach click events to legal returns
    //   else, unmark selected,
    //      remove return click handlers
    //     attach depart click events
    // on return click, 'toggle' target,
    //   if on, mark selected, highlight intermediate
    //   else, unmark selected, intermediate

    var nestedTrips = d3.nest()
            .key(function(t) { return t.departure_date; })
            .sortKeys(function (a, b) { return +a - +b; })
            .entries(trips),
        departureDates = nestedTrips.map(function(d) { return d.values[0].departure_date; }),
        daydivs = d3parent.selectAll('.trip-selector-body .trip-selector-column'),
        ymdFormat = d3.time.format.utc('%Y-%m-%d'),
        humanFormat = d3.time.format.utc('%a, %b %e, %Y');

    function addClickEvents(dates, handler) {
        var timestamps = dates.map(function(d) { return d.getTime(); });
        daydivs.filter(function(d) { return timestamps.indexOf(d.getTime()) >= 0 })
            .on('click', handler ? function() { handler(d3.select(this));} : null )
            .classed('trip-selector-active', handler != null);
    }

    function resetDateDisplay() {
        $('#reset-button').addClass('disabled');
        d3parent.select('.trip-selector-departure-date')
            .classed('trip-selector-active', true)
            .text('Select Date');
        d3parent.select('.trip-selector-return-date')
            .classed('trip-selector-active', false)
            .text('\u2014')
        // hide date display widgets until first date picked
        $('.trip-selector-dates').slideUp();
        $('.trip-filter').slideDown();
        var info = nestedTrips.length + " departure date";
        if (nestedTrips.length != 1) info += "s";
        if (nestedTrips.length > 0) {
            var fmt = d3.time.format.utc('%B'),
                m1 = fmt(nestedTrips[0].values[0].departure_date),
                m2 = fmt(nestedTrips[nestedTrips.length-1].values[0].departure_date);
            info += " " + m1;
            if (m1 != m2) info += " to " + m2;
        }
        $('.trip-selector-info').html(info);
    }

    function toggleDeparture(day) {
        var selected = day.classed('trip-selector-departure');
        day.classed('trip-selector-departure', !selected);

        var departureDate = day.datum(),
            departureTimestamp = departureDate.getTime()

        // find this departure
        for (i=0; i<nestedTrips.length; i++) {
            if (nestedTrips[i].values[0].departure_date.getTime() == departureTimestamp)
                break;
        }
        // grab all the associated return dates
        var allReturnDates = nestedTrips[i].values.map(function(d) { return d.return_date; }),
            returnDates = allReturnDates.filter(function(d) { return d ? true : false });

        // interpret an empty return date as meaning anything in next 28 days
        if (allReturnDates.length > returnDates.length) {
            returnDates = d3.time.day.utc.range(
                d3.time.day.utc.offset(departureDate, 1),
                d3.time.day.utc.offset(departureDate, 29)
            );
        }

        if (selected) {  // un-select this departure, showing legal departure dates again
            resetDateDisplay();

            daydivs.classed('trip-selector-return', false);  // clear any return selection
            daydivs.classed('trip-selector-away', false);
            setConfirm(null);

            addClickEvents(returnDates, null);
            addClickEvents(departureDates, toggleDeparture);
        } else { // select this departure, and show legal returns
            $('.trip-selector-dates').slideDown();
            $('.trip-filter').slideUp();
            $('.trip-selector-info').html(
                returnDates.length + " return date"
                + (returnDates.length != 1 ? "s":"")
            );
            $('#reset-button').removeClass('disabled');
            d3parent.select('.trip-selector-departure-date')
                .classed('trip-selector-active', false)
                .text(humanFormat(day.datum()));
            d3parent.select('.trip-selector-return-date')
                .classed('trip-selector-active', true)
                .text('Select Date');

            var departureDatesExceptThisOne
                = departureDates.filter(function(d) { return d.getTime() != departureTimestamp; });
            addClickEvents(departureDatesExceptThisOne, null);
            addClickEvents(returnDates, toggleReturn);
        }
    }

    function toggleReturn(day) {
        var selected = day.classed('trip-selector-return');
        daydivs.classed('trip-selector-away', false);
        if (selected) {
            d3parent.select('.trip-selector-return-date')
                .classed('trip-selector-active', true)
                .text('Select Date');
            var numReturns = $('.trip-selector-column.trip-selector-active').length-1;
            $('.trip-selector-info').html(
                numReturns + " return date" + (numReturns != 1 ? "s":"")
            );
            setConfirm(null);
        } else {
            d3parent.select('.trip-selector-return-date')
                .classed('trip-selector-active', false)
                .text(humanFormat(day.datum()));
            var departureDate = d3.select('.trip-selector-departure').datum(),
                stay = d3.time.day.utc.range(departureDate, day.datum()).length,
                departureTimestamp = departureDate.getTime(),
                returnTimestamp = day.datum().getTime();
            daydivs.classed('trip-selector-return', false); // clear prior return selection
            daydivs.filter(function(d) {
                    return d.getTime() > departureTimestamp && d.getTime() < returnTimestamp;
                })
                .classed('trip-selector-away', true);
            setConfirm(departureDate, day.datum());
            $('.trip-selector-info').html(
                "Stay " + stay + " day" + (stay != 1 ? "s" : "")
            );
        }
        day.classed('trip-selector-return', !selected);
    }

    function setConfirm(dep, ret) {
        var elt = d3.select('.trip-selector-choose-button');
        if (dep) {
            elt.style({'display': 'block'})
                .select('a')
                .attr('href', urlFn(dep, ret));

            var h = elt.node().getBoundingClientRect().height;

            elt.style('bottom', -h + 'px')
                .transition()
                .style('bottom', '0px');
        } else {
            elt.style('display', 'none');
        }
    }

    resetDateDisplay();
    setConfirm(null);
    daydivs.on('click', null)
        .classed('trip-selector-active', false)
        .classed('trip-selector-departure', false)
        .classed('trip-selector-return', false)
        .classed('trip-selector-away', false);
    addClickEvents(departureDates, toggleDeparture);

    // scroll to first active date
    var active = $('.trip-selector-column.trip-selector-active');
    if (active.length) {
        var y0 = $('.trip-selector-body').scrollTop(),
            dy = active.eq(0).position().top;
        $('.trip-selector-body').animate({scrollTop: y0+dy});
    }
}